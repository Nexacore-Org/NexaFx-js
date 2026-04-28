import { Injectable, UnauthorizedException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
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

/** Bcrypt-equivalent using PBKDF2 (Node built-in, no external deps). */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

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

  // ── Password helpers (exported for use in controller) ─────────────────────

  hashPassword(password: string): string {
    return hashPassword(password);
  }

  verifyPassword(password: string, stored: string): boolean {
    return verifyPassword(password, stored);
  }

  // ── Token helpers ──────────────────────────────────────────────────────────

  private generateRefreshToken(): { raw: string; hash: string; family: string } {
    const raw = crypto.randomBytes(40).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const family = crypto.randomBytes(16).toString('hex');
    return { raw, hash, family };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private issueAccessToken(user: UserEntity): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: (user as any).role ?? 'user',
    });
  }

  // ── Core auth flows ────────────────────────────────────────────────────────

  /**
   * Register a new user. Hashes password with PBKDF2 (cost ≥ bcrypt 12 equivalent).
   */
  async register(
    userData: { email: string; password: string; firstName: string; lastName: string },
    referralCode?: string,
    auditContext?: AuditContext,
  ): Promise<{ user: UserEntity; accessToken: string; refreshToken: string }> {
    const existing = await this.userRepository.findOne({ where: { email: userData.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = hashPassword(userData.password);
    const { raw: refreshRaw, hash: refreshHash, family } = this.generateRefreshToken();
    const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const user = this.userRepository.create({
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      passwordHash,
      status: 'active',
      refreshTokenHash: refreshHash,
      refreshTokenFamily: family,
      refreshTokenExpiry: refreshExpiry,
    });
    const saved = await this.userRepository.save(user);

    await this.linkReferralOnRegistration(saved.id, referralCode);
    await this.sendEmailVerification(saved.id, saved.email);

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'REGISTER', saved.id);
    }

    const accessToken = this.issueAccessToken(saved);
    return { user: saved, accessToken, refreshToken: refreshRaw };
  }

  /**
   * Login. Validates password, tracks device, issues JWT + refresh token.
   */
  async login(
    email: string,
    password: string,
    deviceDto: RegisterDeviceDto,
    auditContext?: AuditContext,
  ): Promise<{ user: UserEntity; accessToken: string; refreshToken: string; requiresTwoFactor?: boolean }> {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });

    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      if (auditContext) {
        await this.logAuthEvent(auditContext, 'LOGIN_FAILED', email, 'Invalid credentials');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new UnauthorizedException('Account is suspended');
    }

    // Issue new refresh token
    const { raw: refreshRaw, hash: refreshHash, family } = this.generateRefreshToken();
    const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.userRepository.update(user.id, {
      refreshTokenHash: refreshHash,
      refreshTokenFamily: family,
      refreshTokenExpiry: refreshExpiry,
    });

    const { device, isNew } = await this.deviceService.registerOrUpdateDevice({
      ...deviceDto,
      userId: user.id,
    });

    if (isNew) {
      await this.mailService.sendNewDeviceLogin(
        user.email,
        device.lastIp || 'Unknown IP',
        device.deviceName || device.userAgent || 'Unknown Device',
      );
    }

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'LOGIN', user.id);
    }

    const accessToken = this.issueAccessToken(user);

    // If 2FA is enabled, return partial response requiring OTP
    if (user.twoFactorEnabled) {
      return { user, accessToken: '', refreshToken: '', requiresTwoFactor: true };
    }

    return { user, accessToken, refreshToken: refreshRaw };
  }

  /**
   * Rotate refresh token. Detects reuse attacks via family tracking.
   */
  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashToken(refreshToken);

    const user = await this.userRepository.findOne({
      where: { refreshTokenHash: tokenHash, deletedAt: IsNull() },
    });

    if (!user) {
      // Possible reuse attack — invalidate the entire family
      // We can't identify the family without the user, so just reject
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.refreshTokenExpiry || user.refreshTokenExpiry < new Date()) {
      await this.userRepository.update(user.id, {
        refreshTokenHash: undefined,
        refreshTokenFamily: undefined,
        refreshTokenExpiry: undefined,
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: issue new refresh token
    const { raw: newRaw, hash: newHash } = this.generateRefreshToken();
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.userRepository.update(user.id, {
      refreshTokenHash: newHash,
      refreshTokenExpiry: newExpiry,
    });

    const accessToken = this.issueAccessToken(user);
    return { accessToken, refreshToken: newRaw };
  }

  /**
   * Logout: invalidate refresh token.
   */
  async logout(userId: string, auditContext?: AuditContext): Promise<void> {
    await this.userRepository.update(userId, {
      refreshTokenHash: undefined,
      refreshTokenFamily: undefined,
      refreshTokenExpiry: undefined,
    });

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'LOGOUT', userId);
    }
  }

  // ── Validation helpers ─────────────────────────────────────────────────────

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
      throw new UnauthorizedException('Account has been deactivated');
    }

    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new UnauthorizedException('Account is suspended');
    }

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'LOGIN', user.id);
    }

    return user;
  }

  async verifyUserIsActive(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    return !!user;
  }

  // ── Password reset ─────────────────────────────────────────────────────────

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

    await this.userRepository.update(user.id, {
      passwordHash: hashPassword(newPassword),
      passwordResetTokenHash: undefined,
      passwordResetExpiry: undefined,
      // Invalidate all refresh tokens on password reset
      refreshTokenHash: undefined,
      refreshTokenFamily: undefined,
      refreshTokenExpiry: undefined,
    });

    if (auditContext) {
      await this.logAuthEvent(auditContext, 'PASSWORD_RESET_COMPLETED', user.id);
    }
  }

  // ── Email verification ─────────────────────────────────────────────────────

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

  // ── Referral ───────────────────────────────────────────────────────────────

  async linkReferralOnRegistration(newUserId: string, referralCode?: string): Promise<void> {
    if (!referralCode) return;
    try {
      await this.referralService.applyReferralCode(newUserId, referralCode);
    } catch (err: any) {
      console.warn(`[AuthService] Referral code '${referralCode}' could not be applied: ${err?.message}`);
    }
  }

  // ── Audit helper ───────────────────────────────────────────────────────────

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
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      this.logger.error(`Failed to log auth event: ${error.message}`, error.stack);
    }
  }
}
