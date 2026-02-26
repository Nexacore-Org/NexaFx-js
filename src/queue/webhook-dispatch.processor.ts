import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { QUEUE_NAMES, JOB_NAMES, QUEUE_CONCURRENCY } from '../queue.constants';
import { DispatchWebhookJobData, JobResult } from '../queue.interfaces';

export interface WebhookDeliveryResult {
  webhookId: string;
  statusCode: number;
  duration: number;
  success: boolean;
  responseBody?: string;
}

@Processor(QUEUE_NAMES.WEBHOOK_DISPATCH, {
  concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.WEBHOOK_DISPATCH],
})
export class WebhookDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDispatchProcessor.name);
  private readonly TIMEOUT_MS = 10_000;

  constructor(
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER) private dlqQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<JobResult> {
    const start = Date.now();

    try {
      let result: unknown;
      switch (job.name) {
        case JOB_NAMES.DISPATCH_WEBHOOK:
          result = await this.handleDispatch(job as Job<DispatchWebhookJobData>);
          break;
        default:
          throw new Error(`Unknown webhook job: ${job.name}`);
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - start,
        idempotencyKey: job.data.idempotencyKey,
      };
    } catch (error) {
      this.logger.error(
        `Webhook job [${job.name}] id=${job.id} failed: ${error.message}`,
      );
      throw error;
    }
  }

  private async handleDispatch(
    job: Job<DispatchWebhookJobData>,
  ): Promise<WebhookDeliveryResult> {
    const {
      webhookId,
      endpoint,
      event,
      payload,
      headers = {},
      signingSecret,
      idempotencyKey,
    } = job.data;

    this.logger.log(
      `Dispatching webhook id=${webhookId} event=${event} endpoint=${endpoint} key=${idempotencyKey}`,
    );

    const body = JSON.stringify({ event, data: payload, idempotencyKey });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Id': webhookId,
      'X-Webhook-Timestamp': timestamp,
      'X-Idempotency-Key': idempotencyKey,
      ...headers,
    };

    if (signingSecret) {
      const signature = this.computeSignature(signingSecret, timestamp, body);
      requestHeaders['X-Webhook-Signature'] = signature;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    const start = Date.now();
    let statusCode = 0;
    let responseBody: string | undefined;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body,
        signal: controller.signal,
      });

      statusCode = response.status;
      responseBody = await response.text().catch(() => undefined);

      if (!response.ok) {
        throw new Error(
          `Webhook delivery failed with status ${statusCode}: ${responseBody}`,
        );
      }

      return {
        webhookId,
        statusCode,
        duration: Date.now() - start,
        success: true,
        responseBody,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private computeSignature(secret: string, timestamp: string, body: string): string {
    const payload = `${timestamp}.${body}`;
    return `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 8);
    this.logger.warn(
      `Webhook job [${job.name}] id=${job.id} attempt ${job.attemptsMade} failed: ${error.message}`,
    );

    if (isFinalAttempt) {
      await this.dlqQueue.add(
        'process-dlq',
        {
          originalQueue: QUEUE_NAMES.WEBHOOK_DISPATCH,
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
      `Webhook job [${job.name}] id=${job.id} delivered in ${result.duration}ms`,
    );
  }
}
