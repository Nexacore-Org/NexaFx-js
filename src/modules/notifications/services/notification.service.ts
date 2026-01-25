import { Injectable, Logger } from '@nestjs/common';
import { NotificationThrottleService, ThrottledNotification, BatchedNotifications } from './notification-throttle.service';

/**
 * NotificationService is the public API for sending notifications.
 * It delegates throttling logic to NotificationThrottleService.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly throttleService: NotificationThrottleService) {}

  /**
   * Send a notification (will be throttled if rules exist)
   */
  async send(notification: {
    type: string;
    userId?: string;
    recipientId?: string;
    payload: Record<string, any>;
    timestamp?: Date;
  }): Promise<{ queued: boolean; batchId?: string }> {
    const throttledNotification: ThrottledNotification = {
      type: notification.type as any,
      userId: notification.userId,
      recipientId: notification.recipientId,
      payload: notification.payload,
      timestamp: notification.timestamp ?? new Date(),
    };

    const queued = await this.throttleService.queue(throttledNotification);

    this.logger.debug(`Notification sent: ${notification.type} (queued: ${queued})`);

    return { queued };
  }

  /**
   * Manually flush notifications for a type
   */
  async flush(notificationType: string): Promise<BatchedNotifications | null> {
    return this.throttleService.flush(notificationType);
  }

  /**
   * Flush all notifications
   */
  async flushAll(): Promise<BatchedNotifications[]> {
    return this.throttleService.flushAll();
  }

  /**
   * Get throttle configuration for a notification type
   */
  async getThrottleConfig(notificationType: string) {
    return this.throttleService.getThrottleConfig(notificationType);
  }

  /**
   * Update throttle configuration
   */
  async updateThrottleConfig(
    notificationType: string,
    config: {
      maxBatchSize?: number;
      windowSeconds?: number;
      cooldownSeconds?: number;
      enabled?: boolean;
      metadata?: Record<string, any>;
    },
  ) {
    return this.throttleService.updateThrottleConfig(notificationType, config);
  }

  /**
   * Get all throttle configurations
   */
  async getAllThrottleConfigs() {
    return this.throttleService.getAllThrottleConfigs();
  }

  /**
   * Get queue status for monitoring
   */
  async getQueueStatus() {
    return this.throttleService.getQueueStatus();
  }

  /**
   * Reset throttle state for a notification type
   */
  async reset(notificationType: string): Promise<void> {
    return this.throttleService.reset(notificationType);
  }
}
