import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { firstValueFrom } from 'rxjs';
import { Job } from 'bull';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { QUEUE_NAMES } from '../queues/queue.constants';
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
} from './webhook-delivery.entity';
import { WebhookEndpoint } from './webhook-endpoint.entity';
import {
  assertPublicWebhookAddresses,
  resolveWebhookAddresses,
} from './webhook-ip';
import { openWebhookSecret } from './webhook-secret';

interface WebhookJobData {
  deliveryId: string;
}

const MAX_RESPONSE_BYTES = 1024 * 1024;
const RESPONSE_EXCERPT_BYTES = 2048;

/** Permanent send-time rejections must not be retried against another DNS answer. */
class WebhookDeliveryBlockedError extends Error {}

/** Ask http(s) to connect to the exact address we validated, with SNI preserved. */
function pinnedLookup(ip: string, family: number): any {
  return (
    _hostname: string,
    _options: unknown,
    callback: (error: Error | null, address: string, family: number) => void,
  ) => callback(null, ip, family);
}

@Injectable()
@Processor(QUEUE_NAMES.WEBHOOKS)
export class WebhooksProcessor {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepository: Repository<WebhookDelivery>,
    @InjectRepository(WebhookEndpoint)
    private readonly endpointsRepository: Repository<WebhookEndpoint>,
    private readonly httpService: HttpService,
    private readonly encryption: EncryptionService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  @Process('deliver')
  async deliver(job: Job<WebhookJobData>): Promise<void> {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id: job.data.deliveryId },
    });
    if (!delivery) {
      this.logger.warn(`Webhook delivery ${job.data.deliveryId} not found`);
      return;
    }

    const endpoint = await this.endpointsRepository.findOne({
      where: { id: delivery.endpointId },
    });
    if (!endpoint) {
      delivery.status = WebhookDeliveryStatus.FAILED;
      delivery.errorMessage = 'Webhook endpoint not found';
      await this.deliveriesRepository.save(delivery);
      return;
    }

    const windowHours = Number(process.env.WEBHOOK_REPLAY_WINDOW_HOURS || '24');
    const expiredAt = job.timestamp + windowHours * 3600_000;
    if (Date.now() > expiredAt) {
      delivery.status = WebhookDeliveryStatus.EXPIRED;
      delivery.errorMessage = 'Delivery window expired';
      delivery.lastAttemptAt = new Date();
      delivery.attemptCount += 1;
      await this.deliveriesRepository.save(delivery);
      return;
    }

    delivery.attemptCount += 1;
    delivery.lastAttemptAt = new Date();
    await this.deliveriesRepository.save(delivery);

    const body = {
      event: delivery.eventName,
      deliveredAt: new Date().toISOString(),
      data: delivery.requestBody,
    };
    const payload = JSON.stringify(body);
    const timestamp = Date.now().toString();

    let agent: http.Agent | https.Agent | undefined;
    try {
      // Resolve A and AAAA immediately before sending. Registration-time checks
      // alone are defeated by DNS rebinding (#1608).
      const target = new URL(endpoint.url);
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        throw new WebhookDeliveryBlockedError('Unsupported webhook URL protocol');
      }
      const hostname = target.hostname.replace(/^\[|\]$/g, '');
      let ip: string;
      try {
        ip = assertPublicWebhookAddresses(
          await resolveWebhookAddresses(hostname),
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes('SSRF not permitted')) {
          throw new WebhookDeliveryBlockedError(error.message);
        }
        // DNS outages remain transient and keep their normal retry behaviour.
        throw error;
      }
      const family = ip.includes(':') ? 6 : 4;
      const lookup = pinnedLookup(ip, family);
      const isHttps = target.protocol === 'https:';
      agent = isHttps
        ? new https.Agent({ lookup, servername: hostname } as https.AgentOptions)
        : new http.Agent({ lookup } as http.AgentOptions);
      const agentConfig = isHttps
        ? { httpsAgent: agent as https.Agent }
        : { httpAgent: agent as http.Agent };

      // Decrypt at send time; the stored value may still be a legacy plaintext
      // secret until the backfill migration runs.
      const secret = openWebhookSecret(this.encryption, endpoint.secret);
      const signed = createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');
      const legacySignature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const response = await firstValueFrom(
        this.httpService.post(endpoint.url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Nexafx-Timestamp': timestamp,
            'X-Nexafx-Signature': signed,
            // Migration window: existing receivers still verify this header.
            'X-Nexafx-Legacy-Signature': legacySignature,
          },
          ...agentConfig,
          maxRedirects: 0,
          maxContentLength: MAX_RESPONSE_BYTES,
          timeout: 10000,
        }),
      );

      const excerpt =
        typeof response.data === 'string'
          ? response.data.slice(0, RESPONSE_EXCERPT_BYTES)
          : (JSON.stringify(response.data ?? '') ?? '').slice(
              0,
              RESPONSE_EXCERPT_BYTES,
            );
      this.logger.debug(
        `Webhook delivery ${delivery.id} responded ${response.status}: ${excerpt}`,
      );

      delivery.status = WebhookDeliveryStatus.DELIVERED;
      delivery.responseCode = response.status;
      delivery.deliveredAt = new Date();
      delivery.errorMessage = null;
      await this.deliveriesRepository.save(delivery);
    } catch (error) {
      const attempts = job.opts.attempts ?? 5;
      const currentAttempt = job.attemptsMade + 1;
      delivery.responseCode =
        (error as { response?: { status?: number } }).response?.status ?? null;
      delivery.errorMessage =
        error instanceof Error ? error.message : 'Unknown delivery error';

      // A blocked address (SSRF) is permanent: mark the delivery FAILED without
      // making a request and without burning the remaining retries.
      if (error instanceof WebhookDeliveryBlockedError) {
        job.discard();
        delivery.status = WebhookDeliveryStatus.FAILED;
        await this.deliveriesRepository.save(delivery);
        return;
      }

      if (currentAttempt >= attempts) {
        delivery.status = WebhookDeliveryStatus.FAILED;
        await this.deliveriesRepository.save(delivery);
      } else {
        await this.deliveriesRepository.save(delivery);
        throw error;
      }
    } finally {
      agent?.destroy();
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<WebhookJobData>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    const deadLetter = job.attemptsMade >= maxAttempts;
    const message = `[${deadLetter ? 'DEAD-LETTER' : 'FAILED'}] webhooks job ${job.id} ` +
      `(delivery ${job.data?.deliveryId ?? 'unknown'}) after ${job.attemptsMade} ` +
      `attempt(s): ${error.message}`;
    if (deadLetter) this.logger.error(message, error.stack);
    else this.logger.warn(message);

    void this.audit
      ?.log({
        action: deadLetter
          ? 'webhook.delivery.dead_letter'
          : 'webhook.delivery.failed',
        entityType: 'webhook_delivery',
        entityId: String(job.data?.deliveryId ?? job.id ?? ''),
        after: {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          failedReason: error.message,
          deadLetter,
        },
      })
      .catch((auditError: unknown) => {
        this.logger.error(
          `Failed to write webhook failure audit event: ${(auditError as Error).message}`,
        );
      });
  }
}
