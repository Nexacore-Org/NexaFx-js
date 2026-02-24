import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from '../queue.constants';
import { DeadLetterJobData, JobResult } from '../queue.interfaces';

@Processor(QUEUE_NAMES.DEAD_LETTER, {
  concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.DEAD_LETTER],
})
export class DeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  async process(job: Job<DeadLetterJobData>): Promise<JobResult> {
    const { originalQueue, originalJobName, failureReason, failedAt, attemptsMade, idempotencyKey } =
      job.data;

    this.logger.error(
      `[DLQ] Job from queue="${originalQueue}" name="${originalJobName}" ` +
      `attempts=${attemptsMade} failedAt=${failedAt} reason="${failureReason}"`,
    );

    // TODO: persist to database via DLQRepository
    // await this.dlqRepository.save({ originalQueue, originalJobName, ... });

    // TODO: send alert via AlertingService
    // await this.alertingService.sendDlqAlert({ ... });

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
