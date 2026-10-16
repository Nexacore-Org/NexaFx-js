import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Otp, OtpPurpose } from './otp.entity';
import { MailService } from '../mail/mail.service';

const MAX_ATTEMPTS = 5;
const MIN_SECRET_LENGTH = 32;

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(Otp)
    private readonly otpRepo: Repository<Otp>,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {
    // Fail fast: codes HMAC'd with an empty or short key can be recovered
    // offline by hashing all 1,000,000 candidates.
    const secret = this.config.get<string>('otp.secret');
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`OTP_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long`);
    }
    this.secret = secret;
  }

  private readonly secret: string;

  async generate(
    userId: string,
    purpose: OtpPurpose,
    email: string,
    fullName: string = '',
    preferredLanguage: string = 'en',
  ): Promise<void> {
    const code = this.randomSixDigit();
    const codeHash = this.hmac(code, this.secret);
    const expiry = this.config.get<number>('otp.expiry') ?? 300;
    const expiresAt = new Date(Date.now() + expiry * 1000);

    await this.otpRepo.delete({ userId, purpose, usedAt: IsNull() });

    const otp = this.otpRepo.create({ userId, codeHash, purpose, expiresAt });
    await this.otpRepo.save(otp);

    await this.mailService.sendVerificationOtp(email, code);
  }

  async verify(userId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
    const otp = await this.otpRepo.findOne({
      where: { userId, purpose },
      order: { createdAt: 'DESC' },
    });

    if (!otp) throw new UnauthorizedException('No OTP found');
    if (otp.usedAt) throw new UnauthorizedException('OTP already used');
    if (otp.expiresAt < new Date()) throw new UnauthorizedException('OTP expired');

    // Count the attempt atomically *before* comparing, and only while attempts
    // remain: parallel guesses cannot all read the same counter.
    const counted = await this.otpRepo
      .createQueryBuilder()
      .update(Otp)
      .set({ attempts: () => '"attempts" + 1' })
      .where('"id" = :id AND "attempts" < :max AND "usedAt" IS NULL', { id: otp.id, max: MAX_ATTEMPTS })
      .execute();
    if (!counted.affected) {
      throw new UnauthorizedException('Max OTP attempts exceeded');
    }

    const computedHash = Buffer.from(this.hmac(code, this.secret), 'hex');
    const storedHash = Buffer.from(otp.codeHash, 'hex');
    const isValid =
      computedHash.length === storedHash.length &&
      crypto.timingSafeEqual(computedHash, storedHash);
    if (!isValid) return false;

    // Single use: only one concurrent verifier can flip usedAt from NULL.
    const consumed = await this.otpRepo.update({ id: otp.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (consumed.affected !== 1) {
      throw new UnauthorizedException('OTP already used');
    }
    return true;
  }

  async invalidate(id: string): Promise<void> {
    await this.otpRepo.update(id, { usedAt: new Date() });
  }

  private randomSixDigit(): string {
    // randomInt's upper bound is exclusive: 0..999999, zero-padded to 6 digits.
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private hmac(value: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(value).digest('hex');
  }
}
