import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { compile, TemplateDelegate, Utils } from 'handlebars';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { Sanitize } from '../common/decorators/sanitize.decorator';

const DEFAULT_LANGUAGE = 'en';

interface MailTemplateContext {
  title: string;
  year: number;
  body: string;
}

export interface StatementReadyEmail {
  to: string;
  fullName: string;
  currency: string;
  from: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
}

export interface TransactionReversalEmail {
  to: string;
  transactionId: string;
  reversedBy: string;
  reason: string;
}

export interface AdminAlertEmail {
  to: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface AccountLockedEmail {
  to: string;
  lockoutMinutes: number;
  failedAttempts: number;
}

export interface SupportTicketCreatedEmail {
  to: string;
  fullName: string;
  ticketId: string;
  subject: string;
  category: string;
}

export interface SupportTicketStatusUpdateEmail {
  to: string;
  fullName: string;
  ticketId: string;
  status: string;
}

type TemplateName =
  | 'base'
  | 'password-reset'
  | 'transaction-confirmation'
  | 'welcome';

class EmailVerificationTemplateDto {
  @Sanitize()
  fullName!: string;

  @Sanitize()
  verificationCode!: string;

  expiresMinutes!: number;
}

class PasswordResetTemplateDto {
  @Sanitize()
  fullName!: string;

  @Sanitize()
  resetUrl!: string;
}

class TransactionConfirmationTemplateDto {
  @Sanitize()
  fullName!: string;

  @Sanitize()
  description!: string;

  amount!: string;
  status!: string;
  transactionId!: string;
  date!: string;
}

class WelcomeTemplateDto {
  @Sanitize()
  fullName!: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly cache = new Map<string, TemplateDelegate>();

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '587', 10),
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: 'Verify your NexaFx email',
        html: `<p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 5 minutes.</p>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${email}`, err);
    }
  }

  renderEmailVerification(
    payload: EmailVerificationTemplateDto,
    language: string = DEFAULT_LANGUAGE,
  ): string {
    const context = plainToInstance(EmailVerificationTemplateDto, payload, {
      enableImplicitConversion: true,
    });
    const body = this.getLocalizedTemplate('email-verification', language)({
      fullName: context.fullName,
      verificationCode: context.verificationCode,
      expiresMinutes: context.expiresMinutes ?? 10,
    });
    return this.getTemplate('base')({
      title: 'Verify your NexaFx account',
      year: new Date().getFullYear(),
      body,
    } as MailTemplateContext);
  }

  renderPasswordReset(payload: PasswordResetTemplateDto): string {
    const context = plainToInstance(PasswordResetTemplateDto, payload, {
      enableImplicitConversion: true,
    });
    return this.render('password-reset', {
      title: 'Reset your NexaFx password',
      fullName: context.fullName,
      resetUrl: context.resetUrl,
    });
  }

  renderTransactionConfirmation(
    payload: TransactionConfirmationTemplateDto,
  ): string {
    const context = plainToInstance(
      TransactionConfirmationTemplateDto,
      payload,
      {
        enableImplicitConversion: true,
      },
    );
    return this.render('transaction-confirmation', {
      title: 'Transaction confirmed',
      fullName: context.fullName,
      description: context.description,
      amount: context.amount,
      status: context.status,
      transactionId: context.transactionId,
      date: context.date,
    });
  }

  renderWelcome(payload: WelcomeTemplateDto): string {
    const context = plainToInstance(WelcomeTemplateDto, payload, {
      enableImplicitConversion: true,
    });
    return this.render('welcome', {
      title: 'Welcome to NexaFx',
      fullName: context.fullName,
    });
  }

  sendStatementReadyEmail(payload: StatementReadyEmail): void {
    this.logger.log(
      `Statement ready email queued for ${payload.to} (${payload.currency} ${payload.from} - ${payload.toDate})`,
    );
  }

  sendTransactionReversalNotice(payload: TransactionReversalEmail): void {
    this.logger.log(
      `Reversal notice queued for ${payload.to} on transaction ${payload.transactionId}`,
    );
  }

  /** Escapes interpolated content the same way the Handlebars-based emails do. */
  renderAdminAlertHtml(payload: AdminAlertEmail): string {
    const escape = (value: unknown) => Utils.escapeExpression(String(value ?? ''));
    return `<h2>${escape(payload.subject)}</h2><p>${escape(payload.body)}</p>${
      payload.metadata
        ? `<pre>${escape(JSON.stringify(payload.metadata, null, 2))}</pre>`
        : ''
    }`;
  }

  renderAccountLockedHtml(payload: AccountLockedEmail): string {
    const escape = (value: unknown) => Utils.escapeExpression(String(value ?? ''));
    return (
      `<h2>Your NexaFx account has been temporarily locked</h2>` +
      `<p>We locked your account for ${escape(payload.lockoutMinutes)} minutes after ` +
      `${escape(payload.failedAttempts)} failed sign-in attempts.</p>` +
      `<p>If this was you, wait and try again. If it was not you, reset your password immediately.</p>`
    );
  }

  /** User-facing lockout notice (not the admin alert template). */
  async sendAccountLockedEmail(payload: AccountLockedEmail): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: payload.to,
        subject: 'Your NexaFx account has been locked',
        html: this.renderAccountLockedHtml(payload),
      });
    } catch (err) {
      this.logger.error(`Failed to send account locked email: ${(err as Error).message}`);
    }
  }

  async sendAdminAlert(payload: AdminAlertEmail): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        html: this.renderAdminAlertHtml(payload),
      });
    } catch (err) {
      this.logger.error(`Failed to send admin alert email: ${(err as Error).message}`);
    }
  }

  sendSupportTicketCreatedEmail(payload: SupportTicketCreatedEmail): void {
    this.logger.log(
      `Support ticket ${payload.ticketId} created for ${payload.to} (${payload.category})`,
    );
  }

  notifyExportReady(payload: {
    to: string;
    downloadUrl: string;
    rowCount: number;
  }): void {
    this.logger.log(
      `Export ready notification queued for ${payload.to} (${payload.rowCount} rows): ${payload.downloadUrl}`,
    );
  }

  sendSupportTicketStatusUpdateEmail(
    payload: SupportTicketStatusUpdateEmail,
  ): void {
    this.logger.log(
      `Support ticket ${payload.ticketId} updated to ${payload.status} for ${payload.to}`,
    );
  }

  sendDailyDigestEmail(payload: {
    to: string;
    fullName: string;
    date: string;
    transactionCount: number;
    totalVolume: number;
  }): void {
    this.logger.log(
      `Daily digest email queued for ${payload.to}: ${payload.transactionCount} transactions (${payload.totalVolume} volume) on ${payload.date}`,
    );
  }

  private render(
    templateName: Exclude<TemplateName, 'base'>,
    context: Record<string, unknown>,
  ): string {
    const bodyTemplate = this.getTemplate(templateName);
    const baseTemplate = this.getTemplate('base');
    const body = bodyTemplate(context);
    const title =
      'title' in context ? String(context.title) : 'NexaFx Notification';
    return baseTemplate({
      title,
      year: new Date().getFullYear(),
      body,
    } as MailTemplateContext);
  }

  private getTemplate(name: TemplateName): TemplateDelegate {
    const cached = this.cache.get(name);
    if (cached) {
      return cached;
    }
    const template = this.compileTemplate(name);
    this.cache.set(name, template);
    return template;
  }

  private compileTemplate(name: TemplateName): TemplateDelegate {
    const path = join(__dirname, 'templates', `${name}.hbs`);
    const source = readFileSync(path, 'utf8');
    this.logger.log(`Compiling mail template ${name}`);
    return compile(source);
  }

  /** Resolves `${name}.${language}.hbs`, falling back to the English template. */
  private getLocalizedTemplate(
    name: string,
    language: string,
  ): TemplateDelegate {
    const cacheKey = `${name}.${language}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const localizedPath = join(
      __dirname,
      'templates',
      `${name}.${language}.hbs`,
    );
    const path = existsSync(localizedPath)
      ? localizedPath
      : join(__dirname, 'templates', `${name}.${DEFAULT_LANGUAGE}.hbs`);

    const template = compile(readFileSync(path, 'utf8'));
    this.cache.set(cacheKey, template);
    return template;
  }
}
