import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from '../queue.constants';
import { DeadLetterJobData, JobResult } from '../queue.interfaces';
import { NotificationOrchestratorService } from '../modules/notifications/services/notification-orchestrator.service';

const DLQ_ALERT_USER_ID = 'system-admin';

@Processor(QUEUE_NAMES.DEAD_LETTER, {
  concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.DEAD_LETTER],
})
export class DeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  constructor(private readonly notificationOrchestrator: NotificationOrchestratorService) {
    super();
  }

  async process(job: Job<DeadLetterJobData>): Promise<JobResult> {
    const { originalQueue, originalJobName, failureReason, failedAt, attemptsMade, idempotencyKey } =
      job.data;

    this.logger.error(
      `[DLQ] Job from queue="${originalQueue}" name="${originalJobName}" ` +
      `attempts=${attemptsMade} failedAt=${failedAt} reason="${failureReason}"`,
    );

    // Emit CRITICAL admin notification for dead-lettered jobs
    try {
      await this.notificationOrchestrator.notify({
        userId: DLQ_ALERT_USER_ID,
        type: 'system.dlq_alert',
        title: 'Dead-Letter Queue Alert',
        body: `Job "${originalJobName}" from queue "${originalQueue}" has been dead-lettered after ${attemptsMade} attempts. Reason: ${failureReason}`,
        urgency: 'critical',
        payload: {
          originalQueue,
          originalJobName,
          failureReason,
          failedAt,
          attemptsMade,
          idempotencyKey,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to send DLQ alert notification: ${err.message}`, err.stack);
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
