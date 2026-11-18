import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
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

  async forgotPassword(email: string): Promise<typeof FORGOT_PASSWORD_RESPONSE> {
    try {
      const user = await this.usersService.findByEmail(email);
      if (user && user.isActive !== false) {
        const rawToken = await this.resetService.createResetToken(user.id);
        await this.mailService.sendPasswordResetLink(user.email, this.resetUrl(rawToken));
      }
    } catch (err) {
      // Never let an internal failure turn into an existence oracle.
      this.logger.error(`Forgot-password failed: ${(err as Error).message}`);
    }
    return FORGOT_PASSWORD_RESPONSE;
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
