import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { UserEntity } from '../users/entities/user.entity';
import { ReferralService } from '../referrals/services/referral.service';
import { MailService } from '../mail/services/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly referralService: ReferralService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validates if a user is active (not soft-deleted) and can login
   */
  async validateUserForLogin(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      withDeleted: true, // Include soft deleted records to check if user is deleted
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is soft deleted
    if (user.deletedAt) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    // Check if user status is active
    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new UnauthorizedException('Account is suspended');
    }

    return user;
  }

  /**
   * Verifies if a user exists and is active (used in JWT validation)
   */
  async verifyUserIsActive(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() }, // Only active users
    });

    return !!user;
  }

  /**
   * Called after a new user has been persisted during registration.
   * Links the new user to the referrer who owns `referralCode` (if provided).
   * Errors are swallowed — referral linkage must never block registration.
   */
  async linkReferralOnRegistration(newUserId: string, referralCode?: string): Promise<void> {
    if (!referralCode) return;

    try {
      await this.referralService.applyReferralCode(newUserId, referralCode);
    } catch (err: any) {
      // Log but never block registration
      // A logger cannot be injected here without circular-dep risk, so use console.warn
      console.warn(
        `[AuthService] Referral code '${referralCode}' could not be applied for user ${newUserId}: ${err?.message}`,
      );
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    if (!user) return; // Don't reveal whether email exists

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await this.userRepository.update(user.id, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiry: expiry,
    });

    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    await this.mailService.sendPasswordReset(email, resetUrl);
  }

  async resetPassword(email: string, token: string, newPasswordHash: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiry) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== user.passwordResetTokenHash) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.userRepository.update(user.id, {
      passwordHash: newPasswordHash,
      passwordResetTokenHash: undefined,
      passwordResetExpiry: undefined,
    });
  }

  async sendEmailVerification(userId: string, email: string): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await this.userRepository.update(userId, { emailVerificationTokenHash: tokenHash });

    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const verifyUrl = `${baseUrl}/auth/verify-email?token=${rawToken}&userId=${userId}`;
    await this.mailService.sendEmailVerification(email, verifyUrl);
  }

  async verifyEmail(userId: string, token: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.emailVerificationTokenHash) {
      throw new BadRequestException('Invalid verification token');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== user.emailVerificationTokenHash) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.userRepository.update(userId, {
      emailVerifiedAt: new Date(),
      emailVerificationTokenHash: undefined,
    });
  }
}
