import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationPreference,
  NotificationChannel,
  NotificationEventType,
} from '../notification-preferences/notification-preference.entity';
import { PushNotificationService, PushPayload } from './push/push.service';

interface PendingNotification {
  userId: string;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  payload: PushPayload;
  timestamp: number;
}

const EMAIL_BATCH_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_WINDOW_MS = 2000;

@Injectable()
export class NotificationBatchingService {
  private readonly logger = new Logger(NotificationBatchingService.name);
  private readonly pending = new Map<string, PendingNotification[]>();
  private readonly emailPending = new Map<string, PendingNotification[]>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private emailTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(NotificationPreference)
    private readonly prefRepo: Repository<NotificationPreference>,
    private readonly pushService: PushNotificationService,
  ) {}

  private get batchWindowMs(): number {
    return this.config.get<number>('NOTIFICATION_BATCH_WINDOW_MS', DEFAULT_BATCH_WINDOW_MS);
  }

  private get batchingEnabled(): boolean {
    return this.config.get<string>('NOTIFICATION_BATCHING_ENABLED', 'true') === 'true';
  }

  private batchKey(userId: string, eventType: NotificationEventType): string {
    return `${userId}:${eventType}`;
  }

  async dispatch(
    userId: string,
    eventType: NotificationEventType,
    payload: PushPayload,
  ): Promise<void> {
    if (!this.batchingEnabled) {
      await this.deliverSingle(userId, eventType, payload);
      return;
    }

    const batchingEnabled = await this.isUserBatchingEnabled(userId);
    if (!batchingEnabled) {
      await this.deliverSingle(userId, eventType, payload);
      return;
    }

    const key = this.batchKey(userId, eventType);
    const entry: PendingNotification = {
      userId,
      eventType,
      channel: NotificationChannel.IN_APP,
      payload,
      timestamp: Date.now(),
    };

    if (!this.pending.has(key)) {
      this.pending.set(key, []);
    }
    this.pending.get(key)!.push(entry);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.batchWindowMs);
    }

    this.addToEmailBatch(userId, eventType, payload);
  }

  private async deliverSingle(
    userId: string,
    eventType: NotificationEventType,
    payload: PushPayload,
  ): Promise<void> {
    try {
      const shouldPush = await this.shouldNotify(userId, NotificationChannel.PUSH, eventType);
      if (shouldPush) {
        await this.pushService.sendToUser(userId, payload);
      }
    } catch (err: any) {
      this.logger.error(`Failed to send push notification: ${err.message}`);
    }
  }

  private async flushBatch(): Promise<void> {
    this.batchTimer = null;
    const entries = new Map(this.pending);
    this.pending.clear();

    for (const [key, notifications] of entries) {
      const [userId, eventType] = key.split(':') as [string, NotificationEventType];
      const deduped = this.deduplicate(notifications);
      const latest = deduped[deduped.length - 1];

      if (!latest) continue;

      try {
        const shouldPush = await this.shouldNotify(userId, NotificationChannel.PUSH, eventType as NotificationEventType);
        if (shouldPush) {
          const batchPayload = deduped.length > 1
            ? {
                ...latest.payload,
                body: `${latest.payload.body} (+${deduped.length - 1} more)`,
              }
            : latest.payload;
          await this.pushService.sendToUser(userId, batchPayload);
        }
      } catch (err: any) {
        this.logger.error(`Failed to send batched push: ${err.message}`);
      }
    }
  }

  private addToEmailBatch(
    userId: string,
    eventType: NotificationEventType,
    payload: PushPayload,
  ): void {
    const key = `email:${userId}`;
    const entry: PendingNotification = {
      userId,
      eventType,
      channel: NotificationChannel.EMAIL,
      payload,
      timestamp: Date.now(),
    };

    if (!this.emailPending.has(key)) {
      this.emailPending.set(key, []);
    }
    this.emailPending.get(key)!.push(entry);

    if (!this.emailTimer) {
      this.emailTimer = setTimeout(() => this.flushEmailBatch(), EMAIL_BATCH_WINDOW_MS);
    }
  }

  private async flushEmailBatch(): Promise<void> {
    this.emailTimer = null;
    const entries = new Map(this.emailPending);
    this.emailPending.clear();

    for (const [, notifications] of entries) {
      if (notifications.length === 0) continue;
      const userId = notifications[0].userId;
      const shouldEmail = await this.shouldNotify(userId, NotificationChannel.EMAIL, notifications[0].eventType);
      if (!shouldEmail) continue;

      this.logger.log(
        `Email batch for user ${userId}: ${notifications.length} notifications combined`,
      );
    }
  }

  private deduplicate(notifications: PendingNotification[]): PendingNotification[] {
    const seen = new Set<string>();
    const result: PendingNotification[] = [];
    for (const n of notifications) {
      const fingerprint = `${n.channel}:${n.payload.title}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        result.push(n);
      }
    }
    return result;
  }

  private async isUserBatchingEnabled(userId: string): Promise<boolean> {
    const pref = await this.prefRepo.findOne({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        eventType: NotificationEventType.SYSTEM,
      },
    });
    if (pref && !pref.batchingEnabled) return false;
    return true;
  }

  private async shouldNotify(
    userId: string,
    channel: NotificationChannel,
    eventType: NotificationEventType,
  ): Promise<boolean> {
    const pref = await this.prefRepo.findOne({
      where: { userId, channel, eventType },
    });
    if (!pref) return true;
    return pref.isEnabled;
  }
}
