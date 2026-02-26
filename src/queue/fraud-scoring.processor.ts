import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, QUEUE_CONCURRENCY } from '../queue.constants';
import {
  ScoreTransactionJobData,
  ReviewAccountJobData,
  FlagSuspiciousJobData,
  JobResult,
} from '../queue.interfaces';

export interface FraudScore {
  score: number;           // 0–100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  signals: string[];
  recommendation: 'allow' | 'review' | 'block';
}

@Processor(QUEUE_NAMES.FRAUD_SCORING, {
  concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.FRAUD_SCORING],
})
export class FraudScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(FraudScoringProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER) private dlqQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FRAUD_SCORING) private fraudQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<JobResult> {
    const start = Date.now();
    this.logger.log(`Processing fraud job [${job.name}] id=${job.id}`);

    try {
      let result: unknown;
      switch (job.name) {
        case JOB_NAMES.SCORE_TRANSACTION:
          result = await this.handleScoreTransaction(
            job as Job<ScoreTransactionJobData>,
          );
          break;
        case JOB_NAMES.REVIEW_ACCOUNT:
          result = await this.handleReviewAccount(
            job as Job<ReviewAccountJobData>,
          );
          break;
        case JOB_NAMES.FLAG_SUSPICIOUS:
          result = await this.handleFlagSuspicious(
            job as Job<FlagSuspiciousJobData>,
          );
          break;
        default:
          throw new Error(`Unknown fraud job: ${job.name}`);
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - start,
        idempotencyKey: job.data.idempotencyKey,
      };
    } catch (error) {
      this.logger.error(
        `Fraud job [${job.name}] failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleScoreTransaction(job: Job<ScoreTransactionJobData>): Promise<FraudScore> {
    const { transactionId, userId, amount, currency, ipAddress, deviceFingerprint, idempotencyKey } =
      job.data;

    this.logger.log(
      `Scoring transaction id=${transactionId} userId=${userId} amount=${amount} ${currency} key=${idempotencyKey}`,
    );

    // TODO: replace with actual ML model / rules engine
    const signals: string[] = [];
    let score = 0;

    if (amount > 10000) { signals.push('high_amount'); score += 20; }
    if (!deviceFingerprint) { signals.push('missing_device'); score += 10; }
    if (!ipAddress) { signals.push('missing_ip'); score += 5; }

    const riskLevel =
      score >= 70 ? 'critical' :
      score >= 50 ? 'high' :
      score >= 30 ? 'medium' : 'low';

    const recommendation =
      score >= 70 ? 'block' :
      score >= 40 ? 'review' : 'allow';

    const fraudScore: FraudScore = { score, riskLevel, signals, recommendation };

    if (recommendation === 'block' || recommendation === 'review') {
      await this.fraudQueue.add(
        JOB_NAMES.FLAG_SUSPICIOUS,
        {
          entityType: 'transaction',
          entityId: transactionId,
          reasons: signals,
          score,
          idempotencyKey: `flag-${idempotencyKey}`,
        },
        { attempts: 3, jobId: `flag-tx-${idempotencyKey}` },
      );
    }

    return fraudScore;
  }

  private async handleReviewAccount(job: Job<ReviewAccountJobData>) {
    const { accountId, triggerReason, priority, idempotencyKey } = job.data;

    this.logger.log(
      `Reviewing account id=${accountId} reason=${triggerReason} priority=${priority} key=${idempotencyKey}`,
    );

    // TODO: inject AccountReviewService
    await this.simulateWork(300);

    return {
      accountId,
      triggerReason,
      reviewed: true,
      actionTaken: 'none',
    };
  }

  private async handleFlagSuspicious(job: Job<FlagSuspiciousJobData>) {
    const { entityType, entityId, reasons, score, idempotencyKey } = job.data;

    this.logger.log(
      `Flagging ${entityType} id=${entityId} score=${score} reasons=${reasons.join(',')} key=${idempotencyKey}`,
    );

    // TODO: inject FraudAlertService / AuditService
    await this.simulateWork(100);

    return { entityType, entityId, flagged: true, score };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 5);
    if (isFinalAttempt) {
      await this.dlqQueue.add(
        'process-dlq',
        {
          originalQueue: QUEUE_NAMES.FRAUD_SCORING,
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
      `Fraud job [${job.name}] id=${job.id} completed in ${result.duration}ms`,
    );
  }

  private simulateWork(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
