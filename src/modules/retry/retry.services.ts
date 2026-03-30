import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { RetryJobEntity, RetryErrorCategory } from './entities/retry-job.entity';
import { getRetryPolicy, getRetryPolicyForType } from './retry-policy';
import { TransactionLifecycleService } from '../transactions/services/transaction-lifecycle.service';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  constructor(
    @InjectRepository(RetryJobEntity)
    private readonly retryRepo: Repository<RetryJobEntity>,
    private readonly transactionLifecycle: TransactionLifecycleService,
  ) {}

  async createJob(params: {
    type: string;
    entityId: string;
    errorCategory: RetryErrorCategory;
    errorMessage: string;
    meta?: Record<string, any>;
  }) {
    const policy = getRetryPolicyForType(params.type) ?? getRetryPolicy(params.errorCategory);

    if (!policy.retryable) {
      return this.retryRepo.save(
        this.retryRepo.create({
          type: params.type,
          entityId: params.entityId,
          status: 'failed',
          attempts: 0,
          nextRunAt: new Date(),
          lastErrorCategory: params.errorCategory,
          lastError: params.errorMessage,
          meta: params.meta,
        }),
      );
    }

    return this.retryRepo.save(
      this.retryRepo.create({
        type: params.type,
        entityId: params.entityId,
        status: 'pending',
        attempts: 0,
        nextRunAt: new Date(Date.now() + 5_000),
        lastErrorCategory: params.errorCategory,
        lastError: params.errorMessage,
        meta: params.meta,
      }),
    );
  }

  async findDueJobs(limit = 50) {
    return this.retryRepo.find({
      where: { status: 'pending', nextRunAt: LessThanOrEqual(new Date()) },
      take: limit,
      order: { nextRunAt: 'ASC' },
    });
  }

  async runJob(jobId: string) {
    const job = await this.retryRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Retry job not found');

    if (job.status === 'running') return job;

    job.status = 'running';
    await this.retryRepo.save(job);

    try {
      await this.executeRetry(job.type, job.entityId);

      job.status = 'succeeded';
      job.lastError = undefined;
      await this.retryRepo.save(job);
      return job;
    } catch (err: any) {
      const policy =
        getRetryPolicyForType(job.type) ??
        getRetryPolicy(job.lastErrorCategory ?? 'UNKNOWN');

      job.attempts += 1;
      job.lastError = err?.message ?? 'Retry failed';

      if (!policy.retryable || job.attempts >= policy.maxAttempts) {
        job.status = 'failed';
        job.nextRunAt = new Date();
        await this.retryRepo.save(job);
        await this.escalateToDlq(job);
      } else {
        job.status = 'pending';
        job.nextRunAt = new Date(Date.now() + policy.backoff(job.attempts) * 1000);
        await this.retryRepo.save(job);
      }

      this.logger.warn(
        `Retry job id=${job.id} entityId=${job.entityId} attempts=${job.attempts} status=${job.status}`,
      );
      return job;
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /**
   * Executes the actual retry — idempotent by entityId.
   * Supports: transfer.retry, payment.retry, deposit.retry, withdrawal.retry
   */
  private async executeRetry(type: string, entityId: string): Promise<void> {
    switch (type) {
      case 'transfer.retry':
      case 'payment.retry':
      case 'deposit.retry':
      case 'withdrawal.retry':
        await this.transactionLifecycle.markProcessing(entityId);
        this.logger.log(`Executed ${type} for entityId=${entityId}`);
        break;
      default:
        throw new Error(`Unsupported retry type: ${type}`);
    }
  }

  /**
   * Persists exhausted job to dead_letter_jobs via the DLQ processor.
   * Uses the existing DeadLetterJobEntity directly to avoid BullMQ dependency here.
   */
  private async escalateToDlq(job: RetryJobEntity): Promise<void> {
    try {
      // Emit an event so the DLQ processor can pick it up, or persist directly.
      // We persist directly to dead_letter_jobs to keep RetryModule self-contained.
      const { DeadLetterJobEntity } = await import('../../queue/entities/dead-letter-job.entity');
      const dlqRepo = this.retryRepo.manager.getRepository(DeadLetterJobEntity);
      await dlqRepo.save(
        dlqRepo.create({
          originalQueue: 'retry-jobs',
          originalJobName: job.type,
          originalJobData: { entityId: job.entityId, meta: job.meta },
          failureReason: job.lastError ?? 'Max attempts exhausted',
          idempotencyKey: `dlq-retry-${job.id}`,
          attemptsMade: job.attempts,
          failedAt: new Date(),
        }),
      );
      this.logger.warn(`Job ${job.id} escalated to DLQ after ${job.attempts} attempts`);
    } catch (err: any) {
      this.logger.error(`DLQ escalation failed for job ${job.id}: ${err.message}`);
    }
  }
}
