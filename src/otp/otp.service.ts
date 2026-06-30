import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { Otp, OtpPurpose } from './otp.entity';
import { MailService } from '../mail/mail.service';

const MAX_ATTEMPTS = 5;

const OTP_SUBJECTS: Record<string, string> = {
  en: 'Your NexaFx verification code',
  fr: 'Votre code de vérification NexaFx',
};

@Injectable()
export class OtpService {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(Otp)
    private readonly otpRepo: Repository<Otp>,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('mail.host'),
      port: this.config.get<number>('mail.port'),
      secure: this.config.get<boolean>('mail.secure'),
      auth: {
        user: this.config.get<string>('mail.user'),
        pass: this.config.get<string>('mail.password'),
      },
    });
  }

  async generate(
    userId: string,
    purpose: OtpPurpose,
    email: string,
    fullName: string = '',
    preferredLanguage: string = 'en',
  ): Promise<void> {
    const code = this.randomSixDigit();
    const secret = this.config.get<string>('otp.secret') ?? '';
    const codeHash = this.hmac(code, secret);
    const expiry = this.config.get<number>('otp.expiry') ?? 300;
    const expiresAt = new Date(Date.now() + expiry * 1000);

    await this.otpRepo.delete({ userId, purpose, usedAt: undefined as any });

    const otp = this.otpRepo.create({ userId, codeHash, purpose, expiresAt });
    await this.otpRepo.save(otp);

    const html = this.mailService.renderEmailVerification(
      { fullName, verificationCode: code, expiresMinutes: Math.round(expiry / 60) },
      preferredLanguage,
    );

    await this.transporter.sendMail({
      from: this.config.get<string>('mail.from'),
      to: email,
      subject: OTP_SUBJECTS[preferredLanguage] ?? OTP_SUBJECTS.en,
      html,
    });
  }

  async verify(userId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
    const otp = await this.otpRepo.findOne({
      where: { userId, purpose },
      order: { createdAt: 'DESC' },
    });

    if (!otp) throw new UnauthorizedException('No OTP found');
    if (otp.usedAt) throw new UnauthorizedException('OTP already used');
    if (otp.expiresAt < new Date()) throw new UnauthorizedException('OTP expired');
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('Max OTP attempts exceeded');
    }

    const secret = this.config.get<string>('otp.secret') ?? '';
    const isValid = this.hmac(code, secret) === otp.codeHash;

    if (!isValid) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      return false;
    }

    otp.usedAt = new Date();
    await this.otpRepo.save(otp);
    return true;
  }

  async invalidate(id: string): Promise<void> {
    await this.otpRepo.update(id, { usedAt: new Date() });
  }

  private randomSixDigit(): string {
    return String(crypto.randomInt(100000, 999999));
  }

  private hmac(value: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(value).digest('hex');
  }
}
