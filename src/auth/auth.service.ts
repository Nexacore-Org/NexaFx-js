import { Injectable, UnauthorizedException, ForbiddenException, Optional } from '@nestjs/common';
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
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { parseDeviceInfo } from './device-info';

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
    @Optional() private readonly refreshTokens?: RefreshTokensService,
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

    return this.issueSession(user, context);
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

    // Missing acceptance of the current terms must not lock the user out:
    // otherwise bumping the terms version would stop everyone from logging in
    // to accept it. The token is issued with a `requiresAction` flag, and the
    // money-moving flows enforce acceptance themselves (ensureAccepted).
    const termsAccepted = await this.termsService.hasAcceptedCurrent(user.id);

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

    return this.issueSession(user, context);
  }

  /**
   * Issue an access token plus a DB-backed, hashed, rotating refresh token
   * with device metadata, so the session shows up in `GET /auth/sessions`.
   */
  private async issueSession(
    user: { id: string; email: string; role: string },
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<{ accessToken: string; refreshToken?: string; refreshTokenExpiresAt?: Date }> {
    if (!this.refreshTokens) {
      return this.issueToken(user.id, user.email, user.role);
    }
    const session = await this.refreshTokens.createToken(user.id, parseDeviceInfo(context));
    return {
      ...this.issueToken(user.id, user.email, user.role, session.id),
      refreshToken: session.token,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }

  /**
   * Rotate a refresh token: the old one is revoked, a new one is issued, and
   * presenting an already-rotated token revokes the whole family.
   */
  async rotateRefreshToken(
    refreshToken: string,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    if (!this.refreshTokens) {
      throw new UnauthorizedException('Refresh tokens are not available');
    }

    const rotated = await this.refreshTokens.rotateToken(refreshToken, parseDeviceInfo(context));

    // Identity and role come from the database, not the presented token, so
    // demotions and deactivations take effect on the next refresh.
    let user;
    try {
      user = await this.usersService.findById(rotated.userId);
    } catch {
      user = null;
    }
    const disabled =
      !user ||
      user.isActive === false ||
      (await this.deactivationService?.isUserDeactivated(user.id));
    if (!user || disabled) {
      await this.refreshTokens.revokeToken(rotated.userId, rotated.id);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      ...this.issueToken(user.id, user.email, user.role, rotated.id),
      refreshToken: rotated.token,
      refreshTokenExpiresAt: rotated.expiresAt,
    };
  }

  /** End the caller's session: revoke the given refresh token, else the one named by `sid`. */
  async logout(userId: string, sid?: string, refreshToken?: string): Promise<void> {
    if (!this.refreshTokens) return;
    if (refreshToken) {
      await this.refreshTokens.revokeByRawToken(userId, refreshToken);
    } else if (sid) {
      await this.refreshTokens.revokeToken(userId, sid);
    }
  }

  private issueToken(userId: string, email: string, role: string, sid?: string) {
    return {
      accessToken: this.jwtService.sign({
        sub: userId,
        email,
        role,
        typ: TokenType.ACCESS,
        ...(sid ? { sid } : {}),
      }),
    };
  }
}
