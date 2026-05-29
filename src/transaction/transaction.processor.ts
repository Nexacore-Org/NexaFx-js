import { Processor, Process, OnQueueFailed, OnQueueError } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, TRANSACTION_JOB_NAMES } from '../queues/queue.constants';

export interface TransactionJobData {
  transactionId: string;
  type: string;
  amount: number;
  currency: string;
  fromWalletId?: string;
  toWalletId?: string;
}

@Processor(QUEUE_NAMES.TRANSACTION)
export class TransactionProcessor {
  private readonly logger = new Logger(TransactionProcessor.name);

  @Process(TRANSACTION_JOB_NAMES.PROCESS)
  handleProcess(job: Job<TransactionJobData>): void {
    this.logger.log(
      `Processing job ${job.id} (${job.name}) — transaction ${job.data.transactionId}`,
    );

    const { transactionId, type, amount, currency } = job.data;

    if (!transactionId || !type || amount == null || !currency) {
      throw new Error(
        'Missing required transaction fields: transactionId, type, amount, currency',
      );
    }

    // Transaction processing integration point.
    this.logger.log(
      `Transaction ${transactionId} processed: ${type} ${amount} ${currency}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job<TransactionJobData>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    const isDeadLetter = job.attemptsMade >= maxAttempts;

    if (isDeadLetter) {
      this.logger.error(
        `[DEAD-LETTER] transaction-queue job ${job.id} (${job.name}) permanently failed ` +
          `after ${job.attemptsMade} attempt(s): ${error.message}`,
        error.stack,
      );
    } else {
      this.logger.warn(
        `transaction-queue job ${job.id} (${job.name}) failed on attempt ${job.attemptsMade} ` +
          `of ${maxAttempts}: ${error.message}`,
      );
    }
  }

  @OnQueueError()
  onError(error: Error): void {
    this.logger.error(
      `transaction-queue encountered an error: ${error.message}`,
      error.stack,
    );
  }
}
