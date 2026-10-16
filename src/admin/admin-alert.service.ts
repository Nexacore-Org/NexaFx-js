import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import { MailService } from '../mail/mail.service';
import { AdminAlertEntity } from './admin-alert.entity';

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
    @Optional()
    @InjectRepository(AdminAlertEntity)
    private readonly alertRepo?: Repository<AdminAlertEntity>,
  ) {
    this.alertEmail = this.configService.get<string>('ADMIN_ALERT_EMAIL');
    this.slackWebhookUrl = this.configService.get<string>('ADMIN_ALERT_SLACK_WEBHOOK_URL');
    this.rateLimitMinutes = this.configService.get<number>('ADMIN_ALERT_RATE_LIMIT_MINUTES', 15);
  }

  /** Local fast path: key -> end of its suppression window. Check-and-set is synchronous, so it is atomic per process. */
  private readonly localWindows = new Map<string, number>();
  /** Alerts suppressed per type since the last digest. */
  private readonly suppressed = new Map<string, { count: number; firstAt: number; subjects: Set<string> }>();

  /** The thing the alert is about; distinct subjects are distinct incidents. */
  private subjectOf(payload: AdminAlertPayload): string {
    const m = payload.metadata ?? {};
    const id = m.userId ?? m.transactionId ?? m.alertId ?? m.accountId;
    return id === undefined || id === null ? 'global' : String(id);
  }

  /**
   * Claim the right to send an alert for `type:subject`. Returns false while a
   * window for the same incident is open. Uses an atomic Redis `SET NX PX`
   * when the cache store is Redis (so it also holds across instances), and an
   * in-process map otherwise.
   */
  private async acquire(type: string, subject: string): Promise<boolean> {
    const key = `${type}:${subject}`;
    const ttlMs = this.rateLimitMinutes * 60_000;
    const now = Date.now();

    const until = this.localWindows.get(key);
    if (until && until > now) return false;
    this.localWindows.set(key, now + ttlMs);

    const redis = (this.cacheManager as unknown as {
      store?: { client?: { set?: (...args: unknown[]) => Promise<string | null> } };
    }).store?.client;
    if (redis?.set) {
      const result = await redis.set(`admin:alert:ratelimit:${key}`, '1', 'PX', ttlMs, 'NX');
      if (result !== 'OK') return false;
    }
    return true;
  }

  private noteSuppressed(type: string, subject: string): void {
    const entry = this.suppressed.get(type) ?? { count: 0, firstAt: Date.now(), subjects: new Set<string>() };
    entry.count += 1;
    entry.subjects.add(subject);
    this.suppressed.set(type, entry);
  }

  private async persist(
    payload: AdminAlertPayload,
    subject: string,
    suppressed: boolean,
  ): Promise<void> {
    if (!this.alertRepo) return;
    try {
      await this.alertRepo.save(
        this.alertRepo.create({
          type: payload.type,
          subject,
          severity: payload.severity,
          title: payload.title,
          message: payload.message,
          metadata: payload.metadata ?? null,
          suppressed,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to persist admin alert: ${(err as Error).message}`);
    }
  }

  /** Summary line for alerts of `type` that were suppressed since the last send; clears the counter. */
  private takeDigest(type: string): string | undefined {
    const entry = this.suppressed.get(type);
    if (!entry || entry.count === 0) return undefined;
    this.suppressed.delete(type);
    const minutes = Math.max(1, Math.round((Date.now() - entry.firstAt) / 60_000));
    return `${entry.count} more ${type} alert(s) for ${entry.subjects.size} subject(s) were suppressed in the last ${minutes} min.`;
  }

  /** Sends one summary per type for suppressed alerts that no new alert has flushed. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async flushSuppressedDigests(): Promise<void> {
    const windowMs = this.rateLimitMinutes * 60_000;
    for (const [type, entry] of [...this.suppressed.entries()]) {
      if (Date.now() - entry.firstAt < windowMs) continue;
      const digest = this.takeDigest(type);
      if (digest) {
        await this.deliver({
          type: `${type}-digest`,
          severity: 'medium',
          title: `Suppressed ${type} alerts`,
          message: digest,
        });
      }
    }
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
    this.record(payload);
    await this.processAlert(payload);
  }

  private async processAlert(payload: AdminAlertPayload): Promise<void> {
    const subject = this.subjectOf(payload);

    // Critical alerts are never suppressed. Everything else is de-duplicated
    // per incident (type + subject), not per type, so a second customer's AML
    // hit or the 500th lockout is not silently dropped.
    if (payload.severity !== 'critical' && !(await this.acquire(payload.type, subject))) {
      this.noteSuppressed(payload.type, subject);
      this.logger.warn(`Alert suppressed (same incident within window): ${payload.type}/${subject} — ${payload.title}`);
      await this.persist(payload, subject, true);
      return;
    }

    const digest = this.takeDigest(payload.type);
    await this.persist(payload, subject, false);
    await this.deliver(digest ? { ...payload, message: `${payload.message}\n\n${digest}` } : payload);
  }

  private async deliver(payload: AdminAlertPayload): Promise<void> {
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

  private readonly alertHistory: Array<AdminAlertPayload & { id: string; timestamp: Date; read: boolean }> = [];

  /** Newest alerts, from the database when available (survives restarts), else this process's memory. */
  async listAlerts(limit = 50): Promise<Array<Partial<AdminAlertEntity>>> {
    if (this.alertRepo) {
      try {
        return await this.alertRepo.find({ order: { createdAt: 'DESC' }, take: limit });
      } catch (err) {
        this.logger.error(`Failed to load alerts: ${(err as Error).message}`);
      }
    }
    return this.alertHistory.slice(-limit).reverse();
  }

  /** Remember the alert in this process's recent-history buffer (both send paths use this). */
  private record(payload: AdminAlertPayload) {
    const alert = {
      id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ...payload,
      timestamp: new Date(),
      read: false,
    };
    this.alertHistory.push(alert);
    if (this.alertHistory.length > 500) this.alertHistory.shift();
    return alert;
  }

  async broadcastAlert(payload: AdminAlertPayload) {
    const alert = this.record(payload);
    await this.processAlert(payload);
    return alert;
  }

  getRecentAlerts() {
    return this.alertHistory.slice(-50);
  }
}
