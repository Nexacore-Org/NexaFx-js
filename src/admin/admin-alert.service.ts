import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import { MailService } from '../mail/mail.service';

export interface AdminAlertPayload {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AdminAlertService {
  private readonly logger = new Logger(AdminAlertService.name);
  private readonly alertEmail: string | undefined;
  private readonly slackWebhookUrl: string | undefined;
  private readonly rateLimitMinutes: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.alertEmail = this.configService.get<string>('ADMIN_ALERT_EMAIL');
    this.slackWebhookUrl = this.configService.get<string>('ADMIN_ALERT_SLACK_WEBHOOK_URL');
    this.rateLimitMinutes = this.configService.get<number>('ADMIN_ALERT_RATE_LIMIT_MINUTES', 15);
  }

  private async isRateLimited(eventType: string): Promise<boolean> {
    const key = `admin:alert:ratelimit:${eventType}`;
    const exists = await this.cacheManager.get<string>(key);
    if (exists) return true;
    await this.cacheManager.set(key, '1', this.rateLimitMinutes * 60_000);
    return false;
  }

  @OnEvent('admin.alert.high-value-transaction')
  async handleHighValueTransaction(payload: AdminAlertPayload): Promise<void> {
    await this.sendAlert(payload);
  }

  @OnEvent('admin.alert.aml-flag')
  async handleAmlFlag(payload: AdminAlertPayload): Promise<void> {
    await this.sendAlert(payload);
  }

  @OnEvent('admin.alert.kyc-failed')
  async handleKycFailed(payload: AdminAlertPayload): Promise<void> {
    await this.sendAlert(payload);
  }

  @OnEvent('admin.alert.account-lockout')
  async handleAccountLockout(payload: AdminAlertPayload): Promise<void> {
    await this.sendAlert(payload);
  }

  async sendAlert(payload: AdminAlertPayload): Promise<void> {
    if (await this.isRateLimited(payload.type)) {
      this.logger.warn(`Alert rate-limited: ${payload.type} — ${payload.title}`);
      return;
    }

    this.logger.log(`[ADMIN ALERT] ${payload.severity.toUpperCase()}: ${payload.title} — ${payload.message}`);

    if (this.alertEmail) {
      try {
        await this.mailService.sendAdminAlert({
          to: this.alertEmail,
          subject: `[${payload.severity.toUpperCase()}] ${payload.title}`,
          body: payload.message,
          metadata: payload.metadata,
        });
      } catch (err) {
        this.logger.error(`Failed to send admin alert email: ${(err as Error).message}`);
      }
    }

    if (this.slackWebhookUrl) {
      try {
        await axios.post(this.slackWebhookUrl, {
          text: `*[${payload.severity.toUpperCase()}]* ${payload.title}\n${payload.message}`,
          attachments: payload.metadata
            ? [{ fields: Object.entries(payload.metadata).map(([k, v]) => ({ title: k, value: String(v), short: true })) }]
            : undefined,
        });
      } catch (err) {
        this.logger.error(`Failed to send Slack alert: ${(err as Error).message}`);
      }
    }
  }
}
