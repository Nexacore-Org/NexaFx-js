import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import axios from 'axios';

import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';
import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';
import { signWebhookPayload } from './utils/webhook-signature';

const EXPONENTIAL_BACKOFF_MS = [60_000, 300_000, 1_800_000]; // 1min, 5min, 30min

@Injectable()
export class WebhookRetryJob {
  private readonly logger = new Logger(WebhookRetryJob.name);

  constructor(
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
    @InjectRepository(WebhookSubscriptionEntity)
    private readonly subRepo: Repository<WebhookSubscriptionEntity>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedDeliveries() {
    const due = await this.deliveryRepo.find({
      where: {
        status: 'failed',
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      take: 50,
      order: { updatedAt: 'ASC' },
    });

    for (const delivery of due) {
      if (delivery.retryCount >= delivery.maxRetries) {
        await this.deliveryRepo.update(
          { id: delivery.id },
          { status: 'failed', nextRetryAt: undefined },
        );
        this.logger.warn(
          `Delivery ${delivery.id} exceeded max retries (${delivery.maxRetries}), marking as permanently failed`,
        );
        continue;
      }

      const sub = await this.subRepo.findOne({
        where: { id: delivery.subscriptionId },
      });
      if (!sub || sub.status !== 'active') continue;

      const rawBody = JSON.stringify(delivery.payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signWebhookPayload(sub.secret, timestamp, rawBody);

      try {
        const res = await axios.post(sub.url, delivery.payload, {
          timeout: 10_000,
          headers: {
            'Content-Type': 'application/json',
            'x-nexafx-event': delivery.eventName,
            'x-nexafx-timestamp': timestamp,
            'x-nexafx-signature': signature,
            'x-nexafx-delivery-id': delivery.id,
          },
        });

        await this.deliveryRepo.update(
          { id: delivery.id },
          {
            status: 'success',
            attempts: delivery.attempts + 1,
            retryCount: delivery.retryCount + 1,
            lastHttpStatus: res.status,
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
            status: 'failed',
            attempts: delivery.attempts + 1,
            retryCount,
            lastHttpStatus: err?.response?.status,
            lastError: err?.message ?? 'Retry failed',
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
