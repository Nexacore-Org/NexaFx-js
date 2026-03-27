import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PushNotificationService } from './push-notification.service';

export interface OrchestratedNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  urgency?: 'normal' | 'high';
  payload?: Record<string, any>;
}

/**
 * NotificationOrchestratorService fans out a notification across all
 * delivery channels: in-app (throttled) and push (FCM/APNs).
 */
@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: PushNotificationService,
  ) {}

  async notify(notification: OrchestratedNotification): Promise<void> {
    const { userId, type, title, body, data, urgency, payload } = notification;

    // 1. In-app / throttled channel
    await this.notificationService.send({
      type,
      userId,
      payload: { title, body, data, ...payload },
    });

    // 2. Push channel (best-effort — failures logged, not re-thrown)
    try {
      const results = await this.pushService.sendToUser(userId, {
        title,
        body,
        data,
        urgency,
      });

      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        this.logger.warn(
          `Push delivery partial failure for user ${userId}: ${failed.map((r) => r.error).join(', ')}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Push delivery error for user ${userId}: ${err?.message}`,
        err?.stack,
      );
    }
  }
}
