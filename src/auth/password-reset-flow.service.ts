import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import type { Queue } from 'bull';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { TOKEN_VERSION_CHANGED_EVENT } from './token-version.service';

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
    @Optional() private readonly events?: EventEmitter2,
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

  /**
   * Strictly single-use and atomic (issue #1526):
   *  1. validate the new password first, so a weak password does not consume the link;
   *  2. claim the token, change the password (which clears any lock and bumps tokenVersion) in ONE
   *     transaction; a failure rolls the claim back, a concurrent request finds no row;
   *  3. only after commit: revoke refresh tokens and email the owner.
   * Unknown, used and expired tokens all return the same generic 400.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<{ message: string }> {
    this.passwordPolicy.validate(newPassword);
    const passwordHash = await this.passwordService.hash(newPassword);

    const userId = await this.resetService.runInTransaction(async (manager) => {
      const id = await this.resetService.claimToken(rawToken, manager);
      await this.usersService.updatePassword(id, passwordHash, manager);
      return id;
    });

    this.events?.emit(TOKEN_VERSION_CHANGED_EVENT, { userId });
    // A reset is also how an owner takes back a compromised account: end every session.
    await this.refreshTokens.revokeUserTokens(userId);
    await this.notifyPasswordChanged(userId);

    return { message: 'Password reset successfully.' };
  }

  /** Best effort: the password is already changed, so a mail failure must not fail the request. */
  private async notifyPasswordChanged(userId: string): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      await this.mailService.sendPasswordChangedNotice(user.email);
    } catch (err) {
      this.logger.error(`Could not send password-changed notice: ${(err as Error).message}`);
    }
  }
}
