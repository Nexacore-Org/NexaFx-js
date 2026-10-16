import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

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
