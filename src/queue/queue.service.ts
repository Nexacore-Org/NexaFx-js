import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents, JobType } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  DEFAULT_JOB_OPTIONS,
} from './queue.constants';
import {
  RetryPaymentJobData,
  RetryTransferJobData,
  RetryNotificationJobData,
  ReconcileTransactionsJobData,
  ReconcileBalancesJobData,
  ReconcileLedgerJobData,
  ScoreTransactionJobData,
  ReviewAccountJobData,
  FlagSuspiciousJobData,
  DispatchWebhookJobData,
} from './queue.interfaces';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor(
    @InjectQueue(QUEUE_NAMES.RETRY_JOBS) private retryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.RECONCILIATION) private reconciliationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FRAUD_SCORING) private fraudQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_DISPATCH) private webhookQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER) private dlqQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('QueueService initialized');
    await this.pauseCheckQueues();
  }

  async onModuleDestroy() {
    for (const [, events] of this.queueEvents) {
      await events.close();
    }
  }

  private async pauseCheckQueues() {
    const queues = [
      this.retryQueue,
      this.reconciliationQueue,
      this.fraudQueue,
      this.webhookQueue,
      this.dlqQueue,
    ];
    for (const queue of queues) {
      const isPaused = await queue.isPaused();
      if (isPaused) {
        this.logger.warn(`Queue ${queue.name} is paused — resuming`);
        await queue.resume();
      }
    }
  }

  // ─── Retry Jobs ───────────────────────────────────────────────────────────

  async enqueueRetryPayment(
    data: Omit<RetryPaymentJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.retryQueue.add(
      JOB_NAMES.RETRY_PAYMENT,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `retry-payment-${key}` },
    );
  }

  async enqueueRetryTransfer(
    data: Omit<RetryTransferJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.retryQueue.add(
      JOB_NAMES.RETRY_TRANSFER,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `retry-transfer-${key}` },
    );
  }

  async enqueueRetryNotification(
    data: Omit<RetryNotificationJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.retryQueue.add(
      JOB_NAMES.RETRY_NOTIFICATION,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `retry-notification-${key}` },
    );
  }

  // ─── Reconciliation Jobs ──────────────────────────────────────────────────

  async enqueueReconcileTransactions(
    data: Omit<ReconcileTransactionsJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.reconciliationQueue.add(
      JOB_NAMES.RECONCILE_TRANSACTIONS,
      { ...data, idempotencyKey: key },
      {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `reconcile-tx-${key}`,
        attempts: 3,
      },
    );
  }

  async enqueueReconcileBalances(
    data: Omit<ReconcileBalancesJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.reconciliationQueue.add(
      JOB_NAMES.RECONCILE_BALANCES,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `reconcile-bal-${key}`, attempts: 3 },
    );
  }

  async enqueueReconcileLedger(
    data: Omit<ReconcileLedgerJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.reconciliationQueue.add(
      JOB_NAMES.RECONCILE_LEDGER,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `reconcile-ledger-${key}`, attempts: 3 },
    );
  }

  // ─── Fraud Jobs ───────────────────────────────────────────────────────────

  async enqueueScoreTransaction(
    data: Omit<ScoreTransactionJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.fraudQueue.add(
      JOB_NAMES.SCORE_TRANSACTION,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `fraud-score-${key}`, priority: 1 },
    );
  }

  async enqueueReviewAccount(
    data: Omit<ReviewAccountJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    const priority = data.priority === 'critical' ? 1 : data.priority === 'high' ? 2 : 3;
    return this.fraudQueue.add(
      JOB_NAMES.REVIEW_ACCOUNT,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `review-account-${key}`, priority },
    );
  }

  async enqueueFlagSuspicious(
    data: Omit<FlagSuspiciousJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.fraudQueue.add(
      JOB_NAMES.FLAG_SUSPICIOUS,
      { ...data, idempotencyKey: key },
      { ...DEFAULT_JOB_OPTIONS, jobId: `flag-suspicious-${key}` },
    );
  }

  // ─── Webhook Jobs ─────────────────────────────────────────────────────────

  async enqueueDispatchWebhook(
    data: Omit<DispatchWebhookJobData, 'idempotencyKey'>,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? uuidv4();
    return this.webhookQueue.add(
      JOB_NAMES.DISPATCH_WEBHOOK,
      { ...data, idempotencyKey: key },
      {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `webhook-${key}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  // ─── Queue Stats ──────────────────────────────────────────────────────────

  async getQueueStats(queueName: string) {
    const queue = this.getQueueByName(queueName);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed, paused] =
      await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getPausedCount(),
      ]);

    return { queueName, waiting, active, completed, failed, delayed, paused };
  }

  async getAllQueueStats() {
    return Promise.all(
      Object.values(QUEUE_NAMES).map((name) => this.getQueueStats(name)),
    );
  }

  async getFailedJobs(queueName: string, start = 0, end = 49) {
    const queue = this.getQueueByName(queueName);
    if (!queue) return [];
    return queue.getFailed(start, end);
  }

  async retryFailedJob(queueName: string, jobId: string) {
    const queue = this.getQueueByName(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    return job.retry();
  }

  async pauseQueue(queueName: string) {
    const queue = this.getQueueByName(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    return queue.pause();
  }

  async resumeQueue(queueName: string) {
    const queue = this.getQueueByName(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    return queue.resume();
  }

  async cleanQueue(
    queueName: string,
    grace: number,
    limit: number,
    type: JobType,
  ) {
    const queue = this.getQueueByName(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    return queue.clean(grace, limit, type);
  }

  private getQueueByName(name: string): Queue | null {
    const map: Record<string, Queue> = {
      [QUEUE_NAMES.RETRY_JOBS]: this.retryQueue,
      [QUEUE_NAMES.RECONCILIATION]: this.reconciliationQueue,
      [QUEUE_NAMES.FRAUD_SCORING]: this.fraudQueue,
      [QUEUE_NAMES.WEBHOOK_DISPATCH]: this.webhookQueue,
      [QUEUE_NAMES.DEAD_LETTER]: this.dlqQueue,
    };
    return map[name] ?? null;
  }
}
