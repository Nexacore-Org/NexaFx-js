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

  /**
   * Registration deliberately keeps its 409 for an already-registered email:
   * the legitimate user needs to learn the address is taken. That is a known
   * enumeration trade-off, mitigated by the strict per-IP throttle on
   * `POST /auth/register` rather than hidden.
   */
  async register(
    dto: RegisterDto,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    this.passwordPolicyService.validate(dto.password, {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    await this.termsService.accept({
      userId: user.id,
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });

    await this.auditService.log({
      userId: user.id,
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      after: { email: user.email },
    });

    return this.issueToken(user.id, user.email, user.role);
  }

  /**
   * bcrypt hash of a throwaway password. Verifying against it when the email
   * is unknown makes the "no such user" path cost the same as a wrong password,
   * closing the timing oracle on account existence.
   */
  private dummyHash?: Promise<string>;

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwordService.hash('nexafx-timing-equaliser-password');
    return this.dummyHash;
  }

  /** Verify a password, migrating legacy SHA-256 hashes to bcrypt on success. */
  private async verifyPassword(
    user: { id: string; passwordHash: string },
    password: string,
  ): Promise<boolean> {
    if (user.passwordHash.startsWith('$')) {
      return this.passwordService.verify(password, user.passwordHash);
    }

    // Legacy SHA-256 hash — verify with old method, then migrate to bcrypt
    const expected = Buffer.from(user.passwordHash);
    const actual = Buffer.from(createHash('sha256').update(password).digest('hex'));
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      const bcryptHash = await this.passwordService.hash(password);
      user.passwordHash = bcryptHash;
      await this.usersService.update?.(user.id, { passwordHash: bcryptHash } as any);
      return true;
    }
    return false;
  }

  /** Count a failed attempt atomically and lock the account at the threshold. */
  private async recordFailedAttempt(user: { id: string; email: string; lockedUntil?: Date | null }) {
    const result = await this.usersService.recordFailedLogin(
      user.id,
      MAX_FAILED_ATTEMPTS,
      LOCKOUT_MINUTES,
    );

    // Notify only on the attempt that crossed the threshold.
    if (result.failedLoginAttempts === MAX_FAILED_ATTEMPTS && result.lockedUntil) {
      try {
        await this.mailService?.sendAccountLockedEmail({
          to: user.email,
          lockoutMinutes: LOCKOUT_MINUTES,
          failedAttempts: MAX_FAILED_ATTEMPTS,
        });
      } catch {
        // Never fail the login flow because the notification could not be sent.
      }

      this.events?.emit('admin.alert.account-lockout', {
        type: 'account-lockout',
        severity: 'high',
        title: 'Account Locked',
        message: `Account ${user.email} locked after ${MAX_FAILED_ATTEMPTS} failed attempts`,
        metadata: { userId: user.id, email: user.email },
      });
    }
  }

  async login(
    dto: LoginDto,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    const user = await this.usersService.findByEmail(dto.email);

    // Always pay for one password verification so response time does not
    // reveal whether the email exists.
    let passwordMatches = false;
    if (user) {
      passwordMatches = await this.verifyPassword(user, dto.password);
    } else {
      await this.passwordService.verify(dto.password, await this.getDummyHash());
    }

    const now = new Date();
    const isLocked = !!user?.lockedUntil && user.lockedUntil > now;

    if (!user || !passwordMatches) {
      // Wrong password, unknown email and a locked account all look the same.
      // A locked account is not counted further, so the lock cannot be extended
      // (or used for denial of service) by repeated guesses.
      if (user && !isLocked) {
        await this.recordFailedAttempt(user);
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Past this point the caller has proven they know the password, so it is
    // safe to say why they cannot log in (and only without exact lock times).
    if (isLocked) {
      throw new ForbiddenException({
        code: 'account_locked',
        message: 'Account is temporarily locked. Try again later.',
      });
    }

    // #910: Check if 2FA enforcement is enabled for admin accounts
    if (user.role === 'admin' && user.require2fa && !dto.totpCode) {
      throw new ForbiddenException({
        code: 'requires_2fa',
        message: '2FA code required for admin accounts',
      });
    }

    // Suspended (isActive=false) and deactivated users get the same response.
    const isDeactivated = await this.deactivationService?.isUserDeactivated(user.id);
    if (user.isActive === false || isDeactivated) {
      throw new UnauthorizedException('Account has been deactivated by an administrator');
    }

    await this.termsService.ensureAccepted(user.id);

    // Successful login — reset failed attempts and any expired lockout
    // (column-only update so a concurrent lock is never overwritten).
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.usersService.resetLoginFailures(user.id);
    }

    await this.auditService.log({
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });

    return this.issueToken(user.id, user.email, user.role);
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
      const user = await this.usersService.findByIdOrNull(payload.sub);
      if (!user || user.isActive === false) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      if (await this.deactivationService?.isUserDeactivated(user.id)) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
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
