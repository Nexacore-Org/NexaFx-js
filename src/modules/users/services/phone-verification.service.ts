import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from '../../notifications/services/sms.service';

interface PendingVerification {
  code: string;
  expiresAt: Date;
  attempts: number;
}

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 3;

/**
 * PhoneVerificationService issues and verifies SMS OTPs before a phone number
 * is stored for notification delivery.
 */
@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  /** userId → pending verification */
  private readonly pendingVerifications = new Map<string, PendingVerification>();

  constructor(
    private readonly smsService: SmsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sends a 6-digit OTP to the given phone number.
   * The OTP is keyed by userId so each user has one active verification at a time.
   */
  async sendOtp(userId: string, phoneNumber: string): Promise<void> {
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    this.pendingVerifications.set(userId, { code, expiresAt, attempts: 0 });

    const result = await this.smsService.send({
      to: phoneNumber,
      body: `Your NexaFx verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    });

    if (!result.success) {
      this.pendingVerifications.delete(userId);
      throw new BadRequestException(`Failed to send OTP: ${result.error}`);
    }

    this.logger.log(`OTP sent to user ${userId} via ${result.provider}`);
  }

  /**
   * Verifies the OTP submitted by the user.
   * Returns true on success; throws on invalid/expired OTP or too many attempts.
   */
  verifyOtp(userId: string, submittedCode: string): true {
    const verification = this.pendingVerifications.get(userId);

    if (!verification) {
      throw new BadRequestException('No pending verification found. Please request a new OTP.');
    }

    if (new Date() > verification.expiresAt) {
      this.pendingVerifications.delete(userId);
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    verification.attempts += 1;

    if (verification.attempts > MAX_OTP_ATTEMPTS) {
      this.pendingVerifications.delete(userId);
      throw new UnauthorizedException('Too many invalid attempts. Please request a new OTP.');
    }

    if (verification.code !== submittedCode) {
      throw new UnauthorizedException(`Invalid OTP. ${MAX_OTP_ATTEMPTS - verification.attempts} attempts remaining.`);
    }

    this.pendingVerifications.delete(userId);
    this.logger.log(`Phone number verified for user ${userId}`);
    return true;
  }

  private generateOtp(): string {
    const min = 10 ** (OTP_LENGTH - 1);
    const max = 10 ** OTP_LENGTH - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
  }
}
