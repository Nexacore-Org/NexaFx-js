import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  passwordResetTemplate,
  emailVerificationTemplate,
  newDeviceLoginTemplate,
  accountLockedTemplate,
} from '../templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT'),
      secure: this.config.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('MAIL_FROM'),
        to,
        subject,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err?.message}`);
      // Never throw — failed email must not block primary operation
    }
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await this.send(to, 'Reset Your Password', passwordResetTemplate(resetUrl));
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    await this.send(to, 'Verify Your Email', emailVerificationTemplate(verifyUrl));
  }

  async sendNewDeviceLogin(to: string, ip: string, userAgent: string): Promise<void> {
    await this.send(to, 'New Device Login Detected', newDeviceLoginTemplate(ip, userAgent));
  }

  async sendAccountLocked(to: string): Promise<void> {
    await this.send(to, 'Account Locked', accountLockedTemplate());
  }
}
