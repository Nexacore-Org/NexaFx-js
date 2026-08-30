import { Processor, Process, OnQueueFailed, OnQueueError } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NOTIFICATION_JOB_NAMES, QUEUE_NAMES } from '../queues/queue.constants';
import { PushNotificationService } from '../notifications/push/push.service';

export interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Processor(QUEUE_NAMES.NOTIFICATION)
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly pushService: PushNotificationService) {}

  @Process(NOTIFICATION_JOB_NAMES.DISPATCH)
  async handleDispatch(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(
      `Processing job ${job.id} (${job.name}) — dispatching notification to user ${job.data.userId}`,
    );

    const { userId, title, body, data } = job.data;

    if (!userId || !title || !body) {
      throw new Error(
        'Missing required notification fields: userId, title, body',
      );
    }

    await this.pushService.sendToUser(userId, { title, body, data });
  }

  @OnQueueFailed()
  onFailed(job: Job<NotificationJobData>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    const isDeadLetter = job.attemptsMade >= maxAttempts;

    if (isDeadLetter) {
      this.logger.error(
        `[DEAD-LETTER] notification-queue job ${job.id} (${job.name}) permanently failed ` +
          `after ${job.attemptsMade} attempt(s): ${error.message}`,
        error.stack,
      );
    } else {
      this.logger.warn(
        `notification-queue job ${job.id} (${job.name}) failed on attempt ${job.attemptsMade} ` +
          `of ${maxAttempts}: ${error.message}`,
      );
    }
  }

  @OnQueueError()
  onError(error: Error): void {
    this.logger.error(
      `notification-queue encountered an error: ${error.message}`,
      error.stack,
    );
  }
}
