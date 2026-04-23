import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';
import { WebhooksService } from './webhooks.service';
import { signWebhookPayload } from './utils/webhook-signature';
import { NotificationService } from '../notifications/services/notification.service';
import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';
import { WebhookFilterService } from './services/webhook-filter.service';
import { CircuitBreaker } from '../../common/circuit-breaker/circuit-breaker.decorator';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
    private readonly notificationService: NotificationService,
    private readonly filterService: WebhookFilterService,
  ) {}

  @CircuitBreaker('webhook-dispatch')
  async dispatch(eventName: string, payload: Record<string, any>) {
    const subs =
      await this.webhooksService.getActiveSubscriptionsForEvent(eventName);

    const eligible = subs.filter((sub) => {
      if (!sub.payloadFilter) return true;
      return this.filterService.matches(payload, sub.payloadFilter);
    });

    for (const sub of eligible) {
      await this.sendToSubscription(sub, eventName, payload);
    }

    return { success: true, sentTo: eligible.length };
  }

  async sendToSubscription(
    subscription: Pick<WebhookSubscriptionEntity, 'id' | 'url' | 'secret'>,
    eventName: string,
    payload: Record<string, any>,
    options: { isReplay?: boolean } = {},
  ) {
    const delivery = await this.deliveryRepo.save(
      this.deliveryRepo.create({
        subscriptionId: subscription.id,
        eventName,
        payload,
        status: 'pending',
        attempts: 0,
        isReplay: options.isReplay ?? false,
      }),
    );

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhookPayload(subscription.secret, timestamp, rawBody);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-nexafx-event': eventName,
      'x-nexafx-timestamp': timestamp,
      'x-nexafx-signature': signature,
      'x-nexafx-delivery-id': delivery.id,
    };

    if (options.isReplay) {
      headers['X-Nexafx-Replay'] = 'true';
    }

    const startTime = Date.now();

    try {
      const res = await axios.post(subscription.url, payload, {
        timeout: 10_000,
        headers,
      });

      const latencyMs = Date.now() - startTime;

      await this.deliveryRepo.update(
        { id: delivery.id },
        {
          status: 'success',
          attempts: delivery.attempts + 1,
          lastHttpStatus: res.status,
          latencyMs,
        },
      );
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const status = err?.response?.status;
      const message = err?.message ?? 'Webhook failed';

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
          latencyMs,
        },
      );

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

    return delivery;
  }

  async replay(deliveryId: string): Promise<{ deliveryId: string }> {
    const original = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!original) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    const subscriptions = await this.webhooksService.getSubscriptionById(original.subscriptionId);
    if (!subscriptions) {
      throw new NotFoundException(`Subscription ${original.subscriptionId} not found`);
    }

    const newDelivery = await this.sendToSubscription(
      subscriptions,
      original.eventName,
      original.payload,
      { isReplay: true },
    );

    return { deliveryId: newDelivery.id };
  }

  async testSend(
    url: string,
    eventName: string,
    payload: Record<string, any>,
    secret: string,
  ): Promise<{ statusCode: number; latencyMs: number; success: boolean; error?: string }> {
    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhookPayload(secret, timestamp, rawBody);
    const startTime = Date.now();

    try {
      const res = await axios.post(url, payload, {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          'x-nexafx-event': eventName,
          'x-nexafx-timestamp': timestamp,
          'x-nexafx-signature': signature,
          'x-nexafx-delivery-id': 'test',
        },
      });
      return { statusCode: res.status, latencyMs: Date.now() - startTime, success: true };
    } catch (err: any) {
      const status = err?.response?.status ?? 0;
      return {
        statusCode: status,
        latencyMs: Date.now() - startTime,
        success: false,
        error: err?.message ?? 'Request failed',
      };
    }
  }

  async getDeliveryDashboard(filters: {
    status?: string;
    eventName?: string;
    subscriptionId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const qb = this.deliveryRepo.createQueryBuilder('d');

    if (filters.status) {
      qb.andWhere('d.status = :status', { status: filters.status });
    }
    if (filters.eventName) {
      qb.andWhere('d.eventName = :eventName', { eventName: filters.eventName });
    }
    if (filters.subscriptionId) {
      qb.andWhere('d.subscriptionId = :subscriptionId', { subscriptionId: filters.subscriptionId });
    }
    if (filters.dateFrom) {
      qb.andWhere('d.createdAt >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
    }
    if (filters.dateTo) {
      qb.andWhere('d.createdAt <= :dateTo', { dateTo: new Date(filters.dateTo) });
    }

    const [items, total] = await qb
      .orderBy('d.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Aggregate stats
    const statsQb = this.deliveryRepo.createQueryBuilder('d');
    if (filters.dateFrom) {
      statsQb.andWhere('d.createdAt >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
    }
    if (filters.dateTo) {
      statsQb.andWhere('d.createdAt <= :dateTo', { dateTo: new Date(filters.dateTo) });
    }

    const stats = await statsQb
      .select('d.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(d."latencyMs")', 'avgLatency')
      .groupBy('d.status')
      .getRawMany();

    const totalCount = stats.reduce((sum, s) => sum + parseInt(s.count, 10), 0);
    const successCount = parseInt(stats.find((s) => s.status === 'success')?.count ?? '0', 10);
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    const avgLatency = stats.find((s) => s.status === 'success')?.avgLatency ?? 0;

    const failureBreakdown = items
      .filter((d) => d.status === 'failed')
      .reduce<Record<string, number>>((acc, d) => {
        const key = d.lastError ?? 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      dashboard: {
        total: totalCount,
        successRate: Math.round(successRate * 100) / 100,
        avgLatencyMs: Math.round(parseFloat(String(avgLatency))),
        byStatus: Object.fromEntries(stats.map((s) => [s.status, parseInt(s.count, 10)])),
        failureBreakdown,
      },
    };
  }
}
