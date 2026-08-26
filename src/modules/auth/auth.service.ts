import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../users/entities/user.entity';
import { ReferralService } from '../referrals/services/referral.service';
import { MailService } from '../mail/services/mail.service';
import { ConfigService } from '@nestjs/config';
import { AdminAuditService, AuditContext } from '../admin-audit/admin-audit.service';
import { ActorType } from '../admin-audit/entities/admin-audit-log.entity';
import { SecretsService } from '../secrets/services/secrets.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly referralService: ReferralService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly adminAuditService: AdminAuditService,
    private readonly secretsService: SecretsService,
  ) {}

  async createUser(userData: Partial<UserEntity>): Promise<UserEntity> {
    if (userData.password && !userData.passwordHash) {
      userData.passwordHash = await bcrypt.hash(userData.password, 12);
      delete userData.password;
    }
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async findUserByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async login(email: string, password: string): Promise<{ accessToken: string; user: UserEntity }> {
    const user = await this.userRepository.findOne({
      where: { email, deletedAt: IsNull() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new UnauthorizedException('Account is suspended');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const secret = await this.secretsService.getActiveSecret('JWT');
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email },
      secret,
      { expiresIn: '24h' },
    );

    return { accessToken, user };
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    if (!user) return;

    if (user.emailVerifiedAt) return;

    await this.sendEmailVerification(user.id, user.email);
  }

  async validateUserForLogin(userId: string, auditContext?: AuditContext): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!user) {
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', userId, 'User not found');
      }
      throw new UnauthorizedException('User not found');
    }

    if (user.deletedAt) {
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', user.id, 'Account has been deactivated');
      }
      throw new UnauthorizedException('Account has been deactivated');
    }

    if (user.status === 'suspended' || user.status === 'deleted') {
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', user.id, 'Account is suspended');
      }
      throw new UnauthorizedException('Account is suspended');
    }

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'LOGIN', user.id);
    }

    return user;
  }

  async logUserLogout(userId: string, auditContext?: AuditContext): Promise<void> {
    if (auditContext) {
      await this.logAuthEvent(auditContext, 'LOGOUT', userId);
    }
  }

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
    }
  }

  async verifyUserIsActive(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    return !!user;
  }

  async linkReferralOnRegistration(newUserId: string, referralCode?: string): Promise<void> {
    if (!referralCode) return;
    try {
      await this.referralService.applyReferralCode(newUserId, referralCode);
    } catch (err: any) {
      console.warn(
        `[AuthService] Referral code '${referralCode}' could not be applied for user ${newUserId}: ${err?.message}`,
      );
    }
  }

  async forgotPassword(email: string, auditContext?: AuditContext): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.userRepository.update(user.id, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiry: expiry,
    });

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'PASSWORD_RESET', user.id);
    }

    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    await this.mailService.sendPasswordReset(email, resetUrl);
  }

  async resetPassword(email: string, token: string, newPassword: string, auditContext?: AuditContext): Promise<void> {
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

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(user.id, {
      passwordHash,
      passwordResetTokenHash: undefined,
      passwordResetExpiry: undefined,
    });

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

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'EMAIL_VERIFIED', userId);
    }
  }
}
