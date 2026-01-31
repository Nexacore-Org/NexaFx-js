import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationThrottleEntity, NotificationType } from '../entities/notification-throttle.entity';

export interface ThrottledNotification {
  type: NotificationType;
  userId?: string;
  recipientId?: string;
  payload: Record<string, any>;
  timestamp: Date;
}

export interface BatchedNotifications {
  type: NotificationType;
  notifications: ThrottledNotification[];
  batchId: string;
  createdAt: Date;
}

/**
 * NotificationThrottleService manages batching and rate limiting of notifications
 * to prevent spam and reduce system load during spikes.
 */
@Injectable()
export class NotificationThrottleService {
  private readonly logger = new Logger(NotificationThrottleService.name);

  // In-memory queue per notification type
  private queues = new Map<string, ThrottledNotification[]>();

  // Timers for scheduled flushing per notification type
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(NotificationThrottleEntity)
    private readonly throttleRepo: Repository<NotificationThrottleEntity>,
  ) {
    this.initializeDefaultRules();
  }

  /**
   * Initialize default throttle rules for common notification types
   */
  private async initializeDefaultRules() {
    const defaultRules: Array<{
      type: NotificationType;
      maxBatchSize: number;
      windowSeconds: number;
      cooldownSeconds: number;
    }> = [
      {
        type: 'transaction.completed',
        maxBatchSize: 20,
        windowSeconds: 300,
        cooldownSeconds: 60,
      },
      {
        type: 'transaction.failed',
        maxBatchSize: 15,
        windowSeconds: 180,
        cooldownSeconds: 45,
      },
      {
        type: 'webhook.failed',
        maxBatchSize: 10,
        windowSeconds: 600,
        cooldownSeconds: 120,
      },
      {
        type: 'retry.job.failed',
        maxBatchSize: 25,
        windowSeconds: 300,
        cooldownSeconds: 60,
      },
      {
        type: 'device.login',
        maxBatchSize: 5,
        windowSeconds: 120,
        cooldownSeconds: 30,
      },
    ];

    for (const rule of defaultRules) {
      const existing = await this.throttleRepo.findOne({
        where: { notificationType: rule.type },
      });

      if (!existing) {
        await this.throttleRepo.save(
          this.throttleRepo.create({
            notificationType: rule.type,
            maxBatchSize: rule.maxBatchSize,
            windowSeconds: rule.windowSeconds,
            cooldownSeconds: rule.cooldownSeconds,
            enabled: true,
            currentBatchCount: 0,
            pendingCount: 0,
          }),
        );
        this.logger.log(`Initialized throttle rule for ${rule.type}`);
      }
    }
  }

  /**
   * Queue a notification for throttling
   * Returns true if notification was queued, false if sent immediately
   */
  async queue(notification: ThrottledNotification): Promise<boolean> {
    const throttle = await this.throttleRepo.findOne({
      where: { notificationType: notification.type },
    });

    // If no throttle rule or throttling disabled, send immediately
    if (!throttle || !throttle.enabled) {
      this.logger.debug(`Sending notification immediately: ${notification.type}`);
      return false;
    }

    // Initialize queue if needed
    if (!this.queues.has(notification.type)) {
      this.queues.set(notification.type, []);
    }

    const queue = this.queues.get(notification.type)!;
    queue.push(notification);

    throttle.pendingCount = queue.length;
    await this.throttleRepo.save(throttle);

    this.logger.debug(
      `Queued notification: ${notification.type} (queue size: ${queue.length})`,
    );

    // Check if we should flush immediately (batch size reached)
    if (queue.length >= throttle.maxBatchSize) {
      this.logger.debug(
        `Batch size threshold reached for ${notification.type}, flushing immediately`,
      );
      await this.flush(notification.type);
      return true;
    }

    // Schedule a flush if not already scheduled
    if (!this.timers.has(notification.type)) {
      const timer = setTimeout(
        () => this.flush(notification.type).catch((err) => {
          this.logger.error(
            `Error flushing notifications for ${notification.type}: ${err.message}`,
          );
        }),
        throttle.windowSeconds * 1000,
      );

      this.timers.set(notification.type, timer);
      this.logger.debug(
        `Scheduled flush for ${notification.type} in ${throttle.windowSeconds}s`,
      );
    }

    return true;
  }

  /**
   * Flush all queued notifications for a type
   */
  async flush(notificationType: string): Promise<BatchedNotifications | null> {
    const queue = this.queues.get(notificationType);

    if (!queue || queue.length === 0) {
      this.logger.debug(`No queued notifications to flush for ${notificationType}`);
      return null;
    }

    // Cancel any scheduled timer
    const timer = this.timers.get(notificationType);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(notificationType);
    }

    const notifications = [...queue];
    const batchId = this.generateBatchId();

    this.logger.log(
      `Flushing ${notifications.length} notifications for ${notificationType} (batch: ${batchId})`,
    );

    // Clear the queue
    this.queues.set(notificationType, []);

    // Update throttle tracking
    const throttle = await this.throttleRepo.findOne({
      where: { notificationType },
    });

    if (throttle) {
      throttle.currentBatchCount = notifications.length;
      throttle.batchStartedAt = new Date();
      throttle.lastSentAt = new Date();
      throttle.pendingCount = 0;
      await this.throttleRepo.save(throttle);
    }

    return {
      type: notificationType as NotificationType,
      notifications,
      batchId,
      createdAt: new Date(),
    };
  }

  /**
   * Get current throttle configuration for a notification type
   */
  async getThrottleConfig(notificationType: string) {
    return this.throttleRepo.findOne({
      where: { notificationType },
    });
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
    let throttle = await this.throttleRepo.findOne({
      where: { notificationType },
    });

    if (!throttle) {
      throttle = this.throttleRepo.create({
        notificationType,
        ...config,
      });
    } else {
      if (config.maxBatchSize !== undefined) throttle.maxBatchSize = config.maxBatchSize;
      if (config.windowSeconds !== undefined) throttle.windowSeconds = config.windowSeconds;
      if (config.cooldownSeconds !== undefined) throttle.cooldownSeconds = config.cooldownSeconds;
      if (config.enabled !== undefined) throttle.enabled = config.enabled;
      if (config.metadata !== undefined) throttle.metadata = config.metadata;
    }

    await this.throttleRepo.save(throttle);
    this.logger.log(`Updated throttle config for ${notificationType}`);

    return throttle;
  }

  /**
   * Get all throttle configurations
   */
  async getAllThrottleConfigs() {
    return this.throttleRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get queue status for monitoring
   */
  async getQueueStatus() {
    const configs = await this.throttleRepo.find();

    const status = configs.map((config) => {
      const queue = this.queues.get(config.notificationType) || [];
      return {
        notificationType: config.notificationType,
        enabled: config.enabled,
        queueLength: queue.length,
        maxBatchSize: config.maxBatchSize,
        windowSeconds: config.windowSeconds,
        cooldownSeconds: config.cooldownSeconds,
        lastSentAt: config.lastSentAt,
        currentBatchCount: config.currentBatchCount,
        pendingCount: config.pendingCount,
      };
    });

    return status;
  }

  /**
   * Force flush all notification types
   */
  async flushAll(): Promise<BatchedNotifications[]> {
    const results: BatchedNotifications[] = [];

    for (const [type] of this.queues) {
      const batched = await this.flush(type);
      if (batched) results.push(batched);
    }

    return results;
  }

  /**
   * Reset a throttle rule (clear queue and timers)
   */
  async reset(notificationType: string): Promise<void> {
    const timer = this.timers.get(notificationType);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(notificationType);
    }

    this.queues.delete(notificationType);

    const throttle = await this.throttleRepo.findOne({
      where: { notificationType },
    });

    if (throttle) {
      throttle.currentBatchCount = 0;
      throttle.pendingCount = 0;
      throttle.batchStartedAt = null;
      await this.throttleRepo.save(throttle);
    }

    this.logger.log(`Reset throttle for ${notificationType}`);
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  onModuleDestroy() {
    // Clean up all timers on shutdown
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
