import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { PasswordResetRateLimiter } from './password-reset-rate-limiter';
import { AuditService } from '../audit/audit.service';
import { EMAIL_JOB_NAMES, QUEUE_NAMES } from '../queues/queue.constants';

/** A second request within this window keeps the existing link instead of replacing it. */
const RESET_LINK_COOLDOWN_MS = 5 * 60 * 1000;

/** Same message whether or not the email exists, so the endpoint reveals nothing. */
export const FORGOT_PASSWORD_RESPONSE = {
  message: 'If an account exists for that email, a reset link has been sent.',
};

/**
 * Forgot-password / reset-password orchestration for the live `/auth` routes.
 * Tokens are single-use and expire after 15 minutes (see PasswordResetService).
 */
@Injectable()
export class PasswordResetFlowService {
  private readonly logger = new Logger(PasswordResetFlowService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly resetService: PasswordResetService,
    private readonly passwordService: PasswordService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly mailService: MailService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly config: ConfigService,
    private readonly limiter: PasswordResetRateLimiter,
    @Optional() private readonly audit?: AuditService,
    @Optional() @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue?: Queue,
  ) {}

  /** Front-end route the emailed link points at (configurable per environment). */
  private resetUrl(rawToken: string): string {
    const base =
      this.config.get<string>('app.frontendUrl') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Always answers with the same generic response, and the request path does the same work
   * for existing and unknown emails: a per-email Redis limit, then one user lookup. Everything
   * that differs (token write, SMTP, audit) runs detached afterwards, so response time cannot
   * be used to tell whether an account exists (issue #1527).
   */
  async forgotPassword(email: string): Promise<typeof FORGOT_PASSWORD_RESPONSE> {
    try {
      if (!(await this.limiter.allow(email))) {
        return FORGOT_PASSWORD_RESPONSE;
      }
      const user = await this.usersService.findByEmail(email);
      if (user && user.isActive !== false) {
        void this.issueResetLink(user.id, user.email).catch((err: unknown) => {
          // Never let an internal failure turn into an existence oracle.
          this.logger.error(`Forgot-password follow-up failed: ${(err as Error).message}`);
        });
      }
    } catch (err) {
      this.logger.error(`Forgot-password failed: ${(err as Error).message}`);
    }
    return FORGOT_PASSWORD_RESPONSE;
  }

  /** Detached part of forgot-password: cooldown check, token, queued mail, audit. */
  private async issueResetLink(userId: string, email: string): Promise<void> {
    const emailHash = PasswordResetRateLimiter.hashEmail(email);

    if (await this.resetService.hasRecentActiveToken(userId, RESET_LINK_COOLDOWN_MS)) {
      // The owner already has a fresh link: keep it rather than invalidating it.
      await this.auditRequest(userId, emailHash, 'reused_existing_link');
      return;
    }

    const rawToken = await this.resetService.createResetToken(userId);
    const resetUrl = this.resetUrl(rawToken);
    if (this.emailQueue) {
      await this.emailQueue.add(EMAIL_JOB_NAMES.PASSWORD_RESET, { to: email, resetUrl });
    } else {
      await this.mailService.sendPasswordResetLink(email, resetUrl);
    }
    await this.auditRequest(userId, emailHash, 'link_issued');
  }

  private async auditRequest(userId: string, emailHash: string, outcome: string): Promise<void> {
    await this.audit?.log({
      userId,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: userId,
      after: { emailHash, outcome },
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<{ message: string }> {
    // Validates single use, expiry and the attempt limit (each call counts as an attempt).
    const userId = await this.resetService.validateToken(rawToken);

    this.passwordPolicy.validate(newPassword);

    const passwordHash = await this.passwordService.hash(newPassword);
    // updatePassword also stamps passwordChangedAt, which invalidates issued access tokens.
    await this.usersService.updatePassword(userId, passwordHash);
    await this.resetService.consumeToken(rawToken);
    // A reset is also how an owner takes back a compromised account: end every session.
    await this.refreshTokens.revokeUserTokens(userId);

    return { message: 'Password reset successfully.' };
  }
}
