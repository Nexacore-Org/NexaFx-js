import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { UserEntity } from '../users/entities/user.entity';
import { ReferralService } from '../referrals/services/referral.service';
import { MailService } from '../mail/services/mail.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeviceService, RegisterDeviceDto } from '../sessions/services/device.service';
import { AdminAuditService, AuditContext } from '../admin-audit/admin-audit.service';
import { ActorType } from '../admin-audit/entities/admin-audit-log.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly referralService: ReferralService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly deviceService: DeviceService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  /**
   * Validates if a user is active (not soft-deleted) and can login
   */
  async validateUserForLogin(userId: string, auditContext?: AuditContext): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      withDeleted: true, // Include soft deleted records to check if user is deleted
    });

    if (!user) {
      // Log failed login attempt
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', userId, 'User not found');
      }
      throw new UnauthorizedException('User not found');
    }

    // Check if user is soft deleted
    if (user.deletedAt) {
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', user.id, 'Account has been deactivated');
      }
      throw new UnauthorizedException('Account has been deactivated');
    }

    // Check if user status is active
    if (user.status === 'suspended' || user.status === 'deleted') {
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', user.id, 'Account is suspended');
      }
      throw new UnauthorizedException('Account is suspended');
    }

    // Log successful login
    if (auditContext) {
      await this.logAuthEvent(auditContext, 'LOGIN', user.id);
    }

    return user;
  }

  /**
   * Registers a new user and sends verification email.
   */
  async register(
    userData: { email: string; passwordHash: string; firstName: string; lastName: string },
    referralCode?: string,
    auditContext?: AuditContext,
  ): Promise<{ user: UserEntity; accessToken: string }> {
    const existing = await this.userRepository.findOne({ where: { email: userData.email } });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const user = this.userRepository.create({
      ...userData,
      status: 'active',
    });
    const saved = await this.userRepository.save(user);

    // Link referral (non-blocking)
    await this.linkReferralOnRegistration(saved.id, referralCode);

    // Send verification email
    await this.sendEmailVerification(saved.id, saved.email);

    // Audit
    if (auditContext) {
      await this.logAuthEvent(auditContext, 'REGISTER', saved.id);
    }

    const accessToken = this.jwtService.sign({ sub: saved.id, email: saved.email });
    return { user: saved, accessToken };
  }

  /**
   * Logins a user and tracks device. Sends notification for new devices.
   */
  async login(
    email: string,
    passwordHash: string,
    deviceDto: RegisterDeviceDto,
    auditContext?: AuditContext,
  ): Promise<{ user: UserEntity; accessToken: string }> {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    
    if (!user || user.passwordHash !== passwordHash) {
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', email, 'Invalid credentials');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reuse existing validation logic
    await this.validateUserForLogin(user.id, auditContext);

    // Register device
    const { device, isNew } = await this.deviceService.registerOrUpdateDevice({
      ...deviceDto,
      userId: user.id,
    });

    // Notify if new device (issue #416)
    if (isNew) {
      await this.mailService.sendNewDeviceLogin(
        user.email,
        device.lastIp || 'Unknown IP',
        device.deviceName || device.userAgent || 'Unknown Device',
      );
    }

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });
    return { user, accessToken };
  }

  /**
   * Logs user logout
   */
  async logUserLogout(userId: string, auditContext?: AuditContext): Promise<void> {
    if (auditContext) {
      await this.logAuthEvent(auditContext, 'LOGOUT', userId);
    }
  }

  /**
   * Helper method to log auth events
   */
  private async logAuthEvent(
    context: AuditContext,
    action: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    try {
      await this.adminAuditService.logAuthEvent(context, {
        userId,
        action: action as any,
        success: !reason,
        reason,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log auth event: ${error.message}`, error.stack);
      // Never block the primary operation
    }
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

  async forgotPassword(email: string, auditContext?: AuditContext): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    if (!user) return; // Don't reveal whether email exists

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await this.userRepository.update(user.id, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiry: expiry,
    });

    // Log password reset request
    if (auditContext) {
      await this.logAuthEvent(auditContext, 'PASSWORD_RESET', user.id);
    }

    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    await this.mailService.sendPasswordReset(email, resetUrl);
  }

  async resetPassword(email: string, token: string, newPasswordHash: string, auditContext?: AuditContext): Promise<void> {
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

    // Log password reset completion
    if (auditContext) {
      await this.logAuthEvent(auditContext, 'PASSWORD_RESET_COMPLETED', user.id);
    }
  }

  async sendEmailVerification(userId: string, email: string): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await this.userRepository.update(userId, { emailVerificationTokenHash: tokenHash });

    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const verifyUrl = `${baseUrl}/auth/verify-email?token=${rawToken}&userId=${userId}`;
    await this.mailService.sendEmailVerification(email, verifyUrl);
  }

  async verifyEmail(userId: string, token: string, auditContext?: AuditContext): Promise<void> {
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

    // Log email verification
    if (auditContext) {
      await this.logAuthEvent(auditContext, 'EMAIL_VERIFIED', userId);
    }
  }
}
