import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { createHmac } from 'crypto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { WebhookDelivery, WebhookDeliveryStatus } from './webhook-delivery.entity';
import { WebhookEndpoint } from './webhook-endpoint.entity';

const EXPONENTIAL_BACKOFF_MS = [60_000, 300_000, 1_800_000]; // 1min, 5min, 30min

@Injectable()
export class WebhookRetryJob {
  private readonly logger = new Logger(WebhookRetryJob.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepo: Repository<WebhookEndpoint>,
    private readonly httpService: HttpService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedDeliveries() {
    const due = await this.deliveryRepo.find({
      where: {
        status: WebhookDeliveryStatus.FAILED,
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      take: 50,
      order: { updatedAt: 'ASC' },
    });

    for (const delivery of due) {
      if (delivery.retryCount >= delivery.maxRetries) {
        await this.deliveryRepo.update(
          { id: delivery.id },
          { status: WebhookDeliveryStatus.FAILED, nextRetryAt: undefined },
        );
        this.logger.warn(
          `Delivery ${delivery.id} exceeded max retries (${delivery.maxRetries}), marking as permanently failed`,
        );
        continue;
      }

      const endpoint = await this.endpointRepo.findOne({
        where: { id: delivery.endpointId },
      });
      if (!endpoint || !endpoint.isActive) continue;

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

        await this.deliveryRepo.update(
          { id: delivery.id },
          {
            status: WebhookDeliveryStatus.DELIVERED,
            attempts: delivery.attempts + 1,
            retryCount: delivery.retryCount + 1,
            responseCode: response.status,
            deliveredAt: new Date(),
            nextRetryAt: undefined,
          },
        );

        this.logger.log(`Delivery ${delivery.id} retried successfully`);
      } catch (err: any) {
        const retryCount = delivery.retryCount + 1;
        const backoffMs =
          EXPONENTIAL_BACKOFF_MS[Math.min(retryCount, EXPONENTIAL_BACKOFF_MS.length - 1)];
        const nextRetryAt =
          retryCount < delivery.maxRetries
            ? new Date(Date.now() + backoffMs)
            : undefined;

        await this.deliveryRepo.update(
          { id: delivery.id },
          {
            status: WebhookDeliveryStatus.FAILED,
            attempts: delivery.attempts + 1,
            retryCount,
            responseCode: err?.response?.status ?? null,
            errorMessage: err?.message ?? 'Retry failed',
            nextRetryAt,
          },
        );

        this.logger.warn(
          `Delivery ${delivery.id} retry ${retryCount}/${delivery.maxRetries} failed: ${err?.message}`,
        );
      }
    }
  }

  async manualRetry(deliveryId: string): Promise<{ deliveryId: string; status: string }> {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) {
      throw new Error(`Delivery ${deliveryId} not found`);
    }

    if (delivery.retryCount >= delivery.maxRetries) {
      await this.deliveryRepo.update(
        { id: delivery.id },
        { retryCount: 0, nextRetryAt: new Date() },
      );
    } else {
      await this.deliveryRepo.update(
        { id: delivery.id },
        { nextRetryAt: new Date() },
      );
    }

    return { deliveryId, status: 'queued' };
  }
}
