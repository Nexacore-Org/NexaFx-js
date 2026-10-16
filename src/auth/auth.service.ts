import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { createHash } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { TermsAcceptanceService } from '../terms/terms-acceptance.service';
import { UsersService } from '../users/users.service';
import { UserDeactivationService } from '../modules/user-deactivation/services/user-deactivation.service';
import { MailService } from '../mail/mail.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { PasswordPolicyService } from './password-policy.service';
import { TokenType } from './token-types';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly termsService: TermsAcceptanceService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly deactivationService: UserDeactivationService,
    private readonly mailService: MailService,
    private readonly events: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly passwordPolicyService: PasswordPolicyService,
  ) {}

  async register(
    dto: RegisterDto,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    this.passwordPolicyService.validate(dto.password);
    const passwordHash = await this.passwordService.hash(dto.password);

    // User, terms acceptance and audit entry commit together: a failure in
    // any of them leaves no orphan account that can neither log in nor
    // re-register.
    const { user } = await this.usersService.createWithin(
      {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      async (created, manager) => {
        await this.termsService.accept(
          {
            userId: created.id,
            ipAddress: context.ip ?? null,
            userAgent: context.userAgent ?? null,
          },
          manager,
        );

        await this.auditService.log(
          {
            userId: created.id,
            action: 'auth.register',
            entityType: 'user',
            entityId: created.id,
            ipAddress: context.ip,
            userAgent: context.userAgent,
            after: { email: created.email },
          },
          manager,
        );
      },
    );

    return this.issueToken(user.id, user.email, user.role);
  }

  async login(
    dto: LoginDto,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // #910: Check if 2FA enforcement is enabled for admin accounts
    if (user.role === 'admin' && user.require2fa && !dto.totpCode) {
      throw new ForbiddenException('2FA code required for admin accounts');
    }

    // #911: Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Account is locked until ${user.lockedUntil.toISOString()}. Try again later.`,
      );
    }

    const isBcryptHash = user.passwordHash.startsWith('$');
    let passwordMatches = false;

    if (isBcryptHash) {
      passwordMatches = await this.passwordService.verify(dto.password, user.passwordHash);
    } else {
      // Legacy SHA-256 hash — verify with old method, then migrate to bcrypt
      const expected = Buffer.from(user.passwordHash);
      const actual = Buffer.from(createHash('sha256').update(dto.password).digest('hex'));
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        passwordMatches = true;
        // Lazy-migrate to bcrypt
        const bcryptHash = await this.passwordService.hash(dto.password);
        (user as any).passwordHash = bcryptHash;
        await this.usersService.update?.(user.id, { passwordHash: bcryptHash } as any);
      }
    }

    if (!passwordMatches) {
      // #911: Increment failed attempts and lock if threshold exceeded
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutUntil = new Date();
        lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_MINUTES);
        user.lockedUntil = lockoutUntil;

        await this.usersService.update?.(user.id, {
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: lockoutUntil,
        });

        // Send lockout notification email
        try {
          await this.mailService?.sendAdminAlert({
            to: user.email,
            subject: 'Account Locked — Too Many Failed Login Attempts',
            body:
              `Your account has been locked for ${LOCKOUT_MINUTES} minutes due to ${MAX_FAILED_ATTEMPTS} consecutive failed login attempts.` +
              ` If this was not you, please reset your password immediately.`,
          });
        } catch (err) {
          // Log but don't fail the login flow
        }

        this.events?.emit('admin.alert.account-lockout', {
          type: 'account-lockout',
          severity: 'high',
          title: 'Account Locked',
          message: `Account ${user.email} locked after ${MAX_FAILED_ATTEMPTS} failed attempts`,
          metadata: { userId: user.id, email: user.email },
        });
      } else {
        await this.usersService.update?.(user.id, {
          failedLoginAttempts: user.failedLoginAttempts,
        });
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login — reset failed attempts and lockout
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.usersService.update?.(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    }

    // Missing acceptance of the current terms must not lock the user out:
    // otherwise bumping the terms version would stop everyone from logging in
    // to accept it. The token is issued with a `requiresAction` flag, and the
    // money-moving flows enforce acceptance themselves (ensureAccepted).
    const termsAccepted = await this.termsService.hasAcceptedCurrent(user.id);

    const isDeactivated = await this.deactivationService?.isUserDeactivated(user.id);
    if (isDeactivated) {
      throw new UnauthorizedException('Account has been deactivated by an administrator');
    }

    await this.auditService.log({
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });

    const token = this.issueToken(user.id, user.email, user.role);
    return termsAccepted
      ? token
      : { ...token, requiresAction: 'accept_terms', version: this.termsService.currentVersion() };
  }

  private readonly usedRefreshTokens = new Set<string>();

  async rotateRefreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    if (this.usedRefreshTokens.has(refreshToken)) {
      throw new ForbiddenException('Refresh token has already been used (token rotation policy)');
    }
    try {
      // Refresh tokens are signed with their own secret and must carry
      // typ=refresh, so an access token can never be replayed here (and a
      // refresh token can never verify as an access token).
      const refreshSecret = this.configService.get<string>('refreshToken.secret');
      const payload = this.jwtService.verify(refreshToken, { secret: refreshSecret });
      if (payload.typ !== TokenType.REFRESH || !payload.sub) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      this.usedRefreshTokens.add(refreshToken);

      // Take identity and role from the database, not the presented token, so
      // demotions and deactivations take effect on the next refresh.
      const user = await this.usersService.findById(payload.sub);
      const newAccessToken = this.issueToken(user.id, user.email, user.role).accessToken;
      const newRefreshToken = this.jwtService.sign(
        { sub: user.id, typ: TokenType.REFRESH },
        { secret: refreshSecret, expiresIn: '7d' },
      );
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private issueToken(userId: string, email: string, role: string) {
    return {
      accessToken: this.jwtService.sign({ sub: userId, email, role, typ: TokenType.ACCESS }),
    };
  }
}
