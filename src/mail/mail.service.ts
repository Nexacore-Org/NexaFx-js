import { Injectable, Logger } from '@nestjs/common';
import { compile, TemplateDelegate } from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { Sanitize } from '../common/decorators/sanitize.decorator';

interface MailTemplateContext {
  title: string;
  year: number;
  body: string;
}

type TemplateName =
  | 'base'
  | 'email-verification'
  | 'password-reset'
  | 'transaction-confirmation'
  | 'welcome';

class EmailVerificationTemplateDto {
  @Sanitize()
  fullName: string;

  @Sanitize()
  verificationCode: string;

  expiresMinutes: number;
}

class PasswordResetTemplateDto {
  @Sanitize()
  fullName: string;

  @Sanitize()
  resetUrl: string;
}

class TransactionConfirmationTemplateDto {
  @Sanitize()
  fullName: string;

  @Sanitize()
  description: string;

  amount: string;

  status: string;
  transactionId: string;
  date: string;
}

class WelcomeTemplateDto {
  @Sanitize()
  fullName: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly cache = new Map<string, TemplateDelegate>();

  renderEmailVerification(payload: EmailVerificationTemplateDto): string {
    const context = plainToInstance(EmailVerificationTemplateDto, payload, {
      enableImplicitConversion: true,
    });
    return this.render('email-verification', {
      title: 'Verify your NexaFx account',
      fullName: context.fullName,
      verificationCode: context.verificationCode,
      expiresMinutes: context.expiresMinutes ?? 10,
    });
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

  renderTransactionConfirmation(payload: TransactionConfirmationTemplateDto): string {
    const context = plainToInstance(TransactionConfirmationTemplateDto, payload, {
      enableImplicitConversion: true,
    });
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

  private render(templateName: Exclude<TemplateName, 'base'>, context: Record<string, unknown>): string {
    const bodyTemplate = this.getTemplate(templateName);
    const baseTemplate = this.getTemplate('base');
    const body = bodyTemplate(context);
    return baseTemplate({
      title: String(context.title ?? 'NexaFx Notification'),
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
}
