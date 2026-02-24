import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, QUEUE_CONCURRENCY } from '../queue.constants';
import {
  RetryPaymentJobData,
  RetryTransferJobData,
  RetryNotificationJobData,
  JobResult,
} from '../queue.interfaces';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Processor(QUEUE_NAMES.RETRY_JOBS, {
  concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.RETRY_JOBS],
})
export class RetryJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(RetryJobsProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER) private dlqQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<JobResult> {
    const start = Date.now();
    this.logger.log(
      `Processing job [${job.name}] id=${job.id} attempt=${job.attemptsMade + 1}`,
    );

    try {
      let result: unknown;
      switch (job.name) {
        case JOB_NAMES.RETRY_PAYMENT:
          result = await this.handleRetryPayment(job as Job<RetryPaymentJobData>);
          break;
        case JOB_NAMES.RETRY_TRANSFER:
          result = await this.handleRetryTransfer(job as Job<RetryTransferJobData>);
          break;
        case JOB_NAMES.RETRY_NOTIFICATION:
          result = await this.handleRetryNotification(job as Job<RetryNotificationJobData>);
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - start,
        idempotencyKey: job.data.idempotencyKey,
      };
    } catch (error) {
      this.logger.error(
        `Job [${job.name}] id=${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleRetryPayment(job: Job<RetryPaymentJobData>) {
    const { transactionId, userId, amount, currency, idempotencyKey } = job.data;

    this.logger.log(
      `Retrying payment txId=${transactionId} userId=${userId} amount=${amount} ${currency} key=${idempotencyKey}`,
    );

    // TODO: inject PaymentsService and call it here
    // await this.paymentsService.processPayment({ transactionId, userId, amount, currency, idempotencyKey });
    // Placeholder — replace with actual service call
    await this.simulateWork(200);

    return { transactionId, retried: true };
  }

  private async handleRetryTransfer(job: Job<RetryTransferJobData>) {
    const { transferId, fromAccountId, toAccountId, amount, idempotencyKey } = job.data;

    this.logger.log(
      `Retrying transfer id=${transferId} from=${fromAccountId} to=${toAccountId} amount=${amount} key=${idempotencyKey}`,
    );

    // TODO: inject TransfersService
    await this.simulateWork(200);

    return { transferId, retried: true };
  }

  private async handleRetryNotification(job: Job<RetryNotificationJobData>) {
    const { notificationId, userId, channel, idempotencyKey } = job.data;

    this.logger.log(
      `Retrying notification id=${notificationId} userId=${userId} channel=${channel} key=${idempotencyKey}`,
    );

    // TODO: inject NotificationsService
    await this.simulateWork(100);

    return { notificationId, channel, retried: true };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 5);

    if (isFinalAttempt) {
      this.logger.error(
        `Job [${job.name}] id=${job.id} exhausted all attempts — sending to DLQ`,
      );

      await this.dlqQueue.add(
        'process-dlq',
        {
          originalQueue: QUEUE_NAMES.RETRY_JOBS,
          originalJobName: job.name,
          originalJobData: job.data,
          failureReason: error.message,
          failedAt: new Date().toISOString(),
          attemptsMade: job.attemptsMade,
          idempotencyKey: `dlq-${job.data.idempotencyKey}`,
        },
        { attempts: 1, removeOnComplete: true },
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: JobResult) {
    this.logger.log(
      `Job [${job.name}] id=${job.id} completed in ${result.duration}ms`,
    );
  }

  private simulateWork(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
