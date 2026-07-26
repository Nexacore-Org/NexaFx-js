import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHmac } from 'crypto';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
} from './webhook-delivery.entity';
import { WebhookEndpoint } from './webhook-endpoint.entity';

interface WebhookJobData {
  deliveryId: string;
}

@Injectable()
@Processor('webhooks')
export class WebhooksProcessor {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepository: Repository<WebhookDelivery>,
    @InjectRepository(WebhookEndpoint)
    private readonly endpointsRepository: Repository<WebhookEndpoint>,
    private readonly httpService: HttpService,
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
    const signature = createHmac('sha256', endpoint.secret)
      .update(payload)
      .digest('hex');

    try {
      const response = await firstValueFrom(
        this.httpService.post(endpoint.url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Nexafx-Signature': signature,
          },
          timeout: 10000,
        }),
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

      if (currentAttempt >= attempts) {
        delivery.status = WebhookDeliveryStatus.FAILED;
        await this.deliveriesRepository.save(delivery);
      } else {
        await this.deliveriesRepository.save(delivery);
        throw error;
      }
    }
  }
}
