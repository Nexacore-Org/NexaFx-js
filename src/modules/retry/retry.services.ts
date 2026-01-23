import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { RetryJobEntity, RetryErrorCategory } from './entities/retry-job.entity';
import { getRetryPolicy } from './retry-policy';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  constructor(
    @InjectRepository(RetryJobEntity)
    private readonly retryRepo: Repository<RetryJobEntity>,
  ) {}

  async createJob(params: {
    type: string;
    entityId: string;
    errorCategory: RetryErrorCategory;
    errorMessage: string;
    meta?: Record<string, any>;
  }) {
    const policy = getRetryPolicy(params.errorCategory);

    // if not retryable => store as failed (tracked but not scheduled)
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
        nextRunAt: new Date(Date.now() + 5_000), // start quick retry
        lastErrorCategory: params.errorCategory,
        lastError: params.errorMessage,
        meta: params.meta,
      }),
    );
  }

  async findDueJobs(limit = 50) {
    return this.retryRepo.find({
      where: {
        status: 'pending',
        nextRunAt: LessThanOrEqual(new Date()),
      },
      take: limit,
      order: { nextRunAt: 'ASC' },
    });
  }

  async runJob(jobId: string) {
    const job = await this.retryRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Retry job not found');

    // lock job to avoid duplicate runs
    if (job.status === 'running') return job;

    job.status = 'running';
    await this.retryRepo.save(job);

    try {
      // ✅ plug your real retry execution here
      await this.executeRetry(job.type, job.entityId);

      job.status = 'succeeded';
      job.lastError = null;
      await this.retryRepo.save(job);

      return job;
    } catch (err: any) {
      const category = (job.lastErrorCategory ?? 'UNKNOWN') as RetryErrorCategory;
      const policy = getRetryPolicy(category);

      const attempts = job.attempts + 1;
      job.attempts = attempts;

      const message = err?.message ?? 'Retry failed';
      job.lastError = message;

      if (!policy.retryable || attempts >= policy.maxAttempts) {
        job.status = 'failed';
        job.nextRunAt = new Date(); // not used now
      } else {
        job.status = 'pending';
        const backoffSecs = policy.backoff(attempts);
        job.nextRunAt = new Date(Date.now() + backoffSecs * 1000);
      }

      await this.retryRepo.save(job);

      this.logger.warn(
        `Retry job failed id=${job.id} entityId=${job.entityId} attempts=${job.attempts} status=${job.status}`,
      );

      return job;
    }
  }

  // This is the hook point that will rerun the transfer safely.
  private async executeRetry(type: string, entityId: string) {
    if (type !== 'transfer.retry') {
      throw new Error(`Unsupported retry type: ${type}`);
    }

    // Example:
    // await this.transfersService.retryTransfer(entityId)
    // You will wire this into your existing transfer execution service.
    this.logger.log(`Executing retry for transfer entityId=${entityId}`);
  }
}
