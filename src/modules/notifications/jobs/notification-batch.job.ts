import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../services/notification.service';

/**
 * NotificationBatchJob processes and flushes notification batches on a schedule.
 * This ensures that notifications are sent periodically even if batch size isn't reached.
 */
@Injectable()
export class NotificationBatchJob {
  private readonly logger = new Logger(NotificationBatchJob.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Process notification batches every 5 minutes
   * This ensures notifications don't get stuck in the queue for too long
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processBatches() {
    try {
      this.logger.debug('Processing notification batches...');
      const flushed = await this.notificationService.flushAll();

      if (flushed.length > 0) {
        const totalNotifications = flushed.reduce((sum, batch) => sum + batch.notifications.length, 0);
        this.logger.log(
          `Processed ${flushed.length} batches with ${totalNotifications} total notifications`,
        );
      } else {
        this.logger.debug('No batches to process');
      }
    } catch (err: any) {
      this.logger.error(`Error processing notification batches: ${err.message}`);
    }
  }

  /**
   * Optional: Monitor queue health every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async monitorQueueHealth() {
    try {
      const status = await this.notificationService.getQueueStatus();
      const totalPending = status.reduce((sum, s) => sum + s.queueLength, 0);

      if (totalPending > 0) {
        this.logger.debug(`Queue health check: ${totalPending} notifications pending across ${status.length} types`);
      }

      // Alert if any queue is getting too large (2x max batch size)
      for (const queue of status) {
        if (queue.queueLength > queue.maxBatchSize * 2) {
          this.logger.warn(
            `Queue warning for ${queue.notificationType}: ${queue.queueLength} pending (threshold: ${queue.maxBatchSize * 2})`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Error monitoring queue health: ${err.message}`);
    }
  }
}
