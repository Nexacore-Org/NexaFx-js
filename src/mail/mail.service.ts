import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { compile, TemplateDelegate, Utils } from 'handlebars';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { Sanitize } from '../common/decorators/sanitize.decorator';

const DEFAULT_LANGUAGE = 'en';
const LOCALIZED_LANGUAGES = ['en', 'fr'] as const;

const TEMPLATE_NAMES = [
  'base',
  'password-reset',
  'transaction-confirmation',
  'welcome',
] as const;

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

export interface RawEmail {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
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
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly cache = new Map<string, TemplateDelegate>();

  constructor() {
    // `MAIL_TRANSPORT=stub` uses nodemailer's JSON transport: tests and local
    // development exercise the real send path without an SMTP server (#1610).
    this.transporter =
      process.env.MAIL_TRANSPORT === 'stub'
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            port: parseInt(process.env.MAIL_PORT || '587', 10),
            secure: process.env.MAIL_SECURE === 'true',
            auth: {
              user: process.env.MAIL_USER,
              pass: process.env.MAIL_PASSWORD,
            },
          });
  }

  /**
   * Load and compile every template at boot. A template missing from the
   * build (e.g. `.hbs` assets not copied to `dist`) must fail startup rather
   * than the first customer-facing send.
   */
  onModuleInit(): void {
    for (const name of TEMPLATE_NAMES) {
      this.getTemplate(name);
    }
    for (const language of LOCALIZED_LANGUAGES) {
      this.getLocalizedTemplate('email-verification', language);
    }
  }

  /**
   * Transport-level send for transactional mail. Errors propagate so Bull can
   * retry. Only configured senders may be used: `MAIL_FROM_ALLOWLIST` accepts
   * exact addresses or whole domains (e.g. `@example.com`); when unset, the
   * configured `MAIL_FROM` is the only permitted sender (#1610).
   */
  async sendRaw(payload: RawEmail): Promise<void> {
    if (!payload.to || !payload.subject) {
      throw new Error('Missing required email fields: to, subject');
    }
    const from = payload.from ?? process.env.MAIL_FROM;
    if (payload.from && !this.isAllowedFrom(payload.from)) {
      throw new Error(`Sender "${payload.from}" is not in MAIL_FROM_ALLOWLIST`);
    }
    await this.transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  }

  /** Backwards-compatible alias; new callers should use sendRaw. */
  async send(payload: RawEmail): Promise<void> {
    return this.sendRaw(payload);
  }

  private isAllowedFrom(from: string): boolean {
    const allowed = (process.env.MAIL_FROM_ALLOWLIST ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length === 0) {
      return from.toLowerCase() === (process.env.MAIL_FROM ?? '').toLowerCase();
    }
    const normalized = from.toLowerCase();
    return allowed.some((entry) =>
      entry.startsWith('@')
        ? normalized.endsWith(entry)
        : normalized === entry,
    );
  }

  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    try {
      await this.sendRaw({
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

  /** Name used by AuthService (issue #1394); delegates to the existing transport path. */
  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    return this.sendPasswordResetLink(email, resetUrl);
  }

  async sendEmailVerification(email: string, verifyUrl: string): Promise<void> {
    try {
      const url = Utils.escapeExpression(verifyUrl);
      await this.sendRaw({
        to: email,
        subject: 'Verify your NexaFx email',
        html: `<p><a href="${url}">Verify your email</a></p><p>If you did not sign up, ignore this email.</p>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification link: ${(err as Error).message}`);
    }
  }

  /** Password reset link. The URL is escaped; the token inside it is single-use and short-lived. */
  async sendPasswordResetLink(to: string, resetUrl: string): Promise<void> {
    try {
      const url = Utils.escapeExpression(resetUrl);
      await this.sendRaw({
        to,
        subject: 'Reset your NexaFx password',
        html:
          `<p>We received a request to reset your NexaFx password.</p>` +
          `<p><a href="${url}">Reset your password</a></p>` +
          `<p>This link expires in 15 minutes and can be used once. If you did not ask for it, ignore this email.</p>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset email: ${(err as Error).message}`);
    }
  }

  /** Tell the owner their password was changed (issue #1526); the account may have been taken over. */
  async sendPasswordChangedNotice(to: string): Promise<void> {
    try {
      await this.sendRaw({
        to,
        subject: 'Your NexaFx password was changed',
        html:
          `<p>The password for your NexaFx account was just changed and all your sessions were signed out.</p>` +
          `<p>If this was you, no action is needed. If it was not, reset your password again and contact support immediately.</p>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send password changed notice: ${(err as Error).message}`);
    }
  }

  async sendAdminAlert(payload: AdminAlertEmail): Promise<void> {
    await this.send({
      to: payload.to,
      subject: payload.subject,
      html: this.renderAdminAlertHtml(payload),
    });
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
    if (!existsSync(path)) {
      throw new Error(
        `Missing mail template "${name}" at ${path}. ` +
          'Ensure nest-cli.json copies mail/templates/**/*.hbs into dist.',
      );
    }
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
    const fallbackPath = join(
      __dirname,
      'templates',
      `${name}.${DEFAULT_LANGUAGE}.hbs`,
    );
    const path = existsSync(localizedPath) ? localizedPath : fallbackPath;

    if (!existsSync(path)) {
      throw new Error(
        `Missing mail template "${name}" for language "${language}" at ${path}. ` +
          'Ensure nest-cli.json copies mail/templates/**/*.hbs into dist.',
      );
    }

    const template = compile(readFileSync(path, 'utf8'));
    this.cache.set(cacheKey, template);
    return template;
  }
}
