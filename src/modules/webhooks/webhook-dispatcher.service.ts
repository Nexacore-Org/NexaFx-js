import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';
import { WebhooksService } from './webhooks.service';
import { signWebhookPayload } from './utils/webhook-signature';
import { NotificationService } from '../notifications/services/notification.service';
import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
    private readonly notificationService: NotificationService,
  ) {}

  async dispatch(eventName: string, payload: Record<string, any>) {
    const subs =
      await this.webhooksService.getActiveSubscriptionsForEvent(eventName);

    for (const sub of subs) {
      await this.sendToSubscription(sub, eventName, payload);
    }

    return { success: true, sentTo: subs.length };
  }

  async sendToSubscription(
    subscription: Pick<WebhookSubscriptionEntity, 'id' | 'url' | 'secret'>,
    eventName: string,
    payload: Record<string, any>,
  ) {
    const delivery = await this.deliveryRepo.save(
      this.deliveryRepo.create({
        subscriptionId: subscription.id,
        eventName,
        payload,
        status: 'pending',
        attempts: 0,
      }),
    );

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhookPayload(subscription.secret, timestamp, rawBody);

    try {
      const res = await axios.post(subscription.url, payload, {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          'x-nexafx-event': eventName,
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
        },
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.message ?? 'Webhook failed';

      // Basic retry strategy (optional):
      // nextRetryAt = now + 1min * attempts
      const attempts = delivery.attempts + 1;
      const nextRetryAt = new Date(Date.now() + 60_000 * attempts);

      await this.deliveryRepo.update(
        { id: delivery.id },
        {
          status: 'failed',
          attempts,
          lastHttpStatus: status,
          lastError: message,
          nextRetryAt,
        },
      );

      // ✅ NEW: Send notification for webhook failure (will be throttled)
      await this.notificationService.send({
        type: 'webhook.failed',
        recipientId: subscription.id,
        payload: {
          webhookUrl: subscription.url,
          eventName,
          error: message,
          httpStatus: status,
          deliveryId: delivery.id,
        },
        timestamp: new Date(),
      });

      this.logger.warn(
        `Webhook delivery failed [${delivery.id}] event=${eventName} url=${subscription.url} status=${status} err=${message}`,
      );
    }
  }
}
