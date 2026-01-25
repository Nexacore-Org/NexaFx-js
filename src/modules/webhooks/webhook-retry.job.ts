import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import axios from 'axios';

import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';
import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';
import { signWebhookPayload } from './utils/webhook-signature';

@Injectable()
export class WebhookRetryJob {
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
            lastHttpStatus: res.status,
            nextRetryAt: undefined,
          },
        );
      } catch (err: any) {
        const attempts = delivery.attempts + 1;
        const nextRetryAt = new Date(Date.now() + 60_000 * attempts);

        await this.deliveryRepo.update(
          { id: delivery.id },
          {
            status: 'failed',
            attempts,
            lastHttpStatus: err?.response?.status,
            lastError: err?.message ?? 'Retry failed',
            nextRetryAt,
          },
        );
      }
    }
  }
}
