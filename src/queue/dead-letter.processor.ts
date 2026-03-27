import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from './queue.constants';
import { DeadLetterJobData, JobResult } from './queue.interfaces';
import { DeadLetterJobEntity } from './entities/dead-letter-job.entity';
import { DlqAlertingService } from './services/alerting.service';

@Processor(QUEUE_NAMES.DEAD_LETTER, {
  concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.DEAD_LETTER],
})
export class DeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  constructor(
    @InjectRepository(DeadLetterJobEntity)
    private readonly dlqRepo: Repository<DeadLetterJobEntity>,
    private readonly alertingService: DlqAlertingService,
  ) {
    super();
  }

  async process(job: Job<DeadLetterJobData>): Promise<JobResult> {
    const {
      originalQueue,
      originalJobName,
      originalJobData,
      failureReason,
      failedAt,
      attemptsMade,
      idempotencyKey,
    } = job.data;

    this.logger.error(
      `[DLQ] Job from queue="${originalQueue}" name="${originalJobName}" ` +
        `attempts=${attemptsMade} failedAt=${failedAt} reason="${failureReason}"`,
    );

    // Persist to dead_letter_jobs — must not throw
    try {
      await this.dlqRepo.save(
        this.dlqRepo.create({
          originalQueue,
          originalJobName,
          originalJobData,
          failureReason,
          idempotencyKey,
          attemptsMade,
          failedAt: new Date(failedAt),
        }),
      );
    } catch (err: any) {
      this.logger.error(`[DLQ] Failed to persist dead-letter job: ${err.message}`, err.stack);
    }

    // Alert ops — must not throw
    try {
      await this.alertingService.sendDlqAlert({
        originalQueue,
        originalJobName,
        failureReason,
        failedAt,
        attemptsMade,
        idempotencyKey,
      });
    } catch (err: any) {
      this.logger.error(`[DLQ] Failed to send DLQ alert: ${err.message}`, err.stack);
    }

    return {
      success: true,
      data: { logged: true, originalQueue, originalJobName },
      idempotencyKey,
    };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[DLQ] Failed to process dead-letter job id=${job.id}: ${error.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`[DLQ] Processed dead-letter job id=${job.id}`);
  }
}
