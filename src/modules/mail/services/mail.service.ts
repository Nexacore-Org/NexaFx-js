import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  passwordResetTemplate,
  emailVerificationTemplate,
  newDeviceLoginTemplate,
  accountLockedTemplate,
} from '../templates';
import { TemplateService } from '../../notifications/services/template.service';
import { TemplateChannel } from '../../notifications/entities/notification-template.entity';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly templateService?: TemplateService,
  ) {
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

  /**
   * Attempt to render a DB template; falls back to the provided hardcoded html.
   */
  private async resolveTemplate(
    name: string,
    variables: Record<string, unknown>,
    fallbackSubject: string,
    fallbackHtml: string,
    locale = 'en',
  ): Promise<{ subject: string; html: string }> {
    if (this.templateService) {
      try {
        const tpl = await this.templateService.resolve(name, TemplateChannel.EMAIL, locale);
        if (tpl) {
          const rendered = this.templateService.render(tpl, variables);
          return {
            subject: rendered.subject ?? fallbackSubject,
            html: rendered.body,
          };
        }
      } catch (err) {
        this.logger.warn(`Template "${name}" render failed, using fallback: ${err?.message}`);
      }
    }
    return { subject: fallbackSubject, html: fallbackHtml };
  }

  async sendPasswordReset(to: string, resetUrl: string, locale = 'en'): Promise<void> {
    const { subject, html } = await this.resolveTemplate(
      'password_reset',
      { resetUrl },
      'Reset Your Password',
      passwordResetTemplate(resetUrl),
      locale,
    );
    await this.send(to, subject, html);
  }

  async sendEmailVerification(to: string, verifyUrl: string, locale = 'en'): Promise<void> {
    const { subject, html } = await this.resolveTemplate(
      'email_verification',
      { verifyUrl },
      'Verify Your Email',
      emailVerificationTemplate(verifyUrl),
      locale,
    );
    await this.send(to, subject, html);
  }

  async sendNewDeviceLogin(to: string, ip: string, userAgent: string, locale = 'en'): Promise<void> {
    const { subject, html } = await this.resolveTemplate(
      'new_device_login',
      { ip, userAgent },
      'New Device Login Detected',
      newDeviceLoginTemplate(ip, userAgent),
      locale,
    );
    await this.send(to, subject, html);
  }

  async sendAccountLocked(to: string, locale = 'en'): Promise<void> {
    const { subject, html } = await this.resolveTemplate(
      'account_locked',
      {},
      'Account Locked',
      accountLockedTemplate(),
      locale,
    );
    await this.send(to, subject, html);
  }
}
