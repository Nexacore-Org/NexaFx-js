import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';

import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';
import { WebhookDeliveryEntity } from './entities/webhook-delivery.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WEBHOOK_EVENT_NAMES } from './webhook-event-catalog';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookSubscriptionEntity)
    private readonly subRepo: Repository<WebhookSubscriptionEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
  ) {}

  async create(dto: CreateWebhookDto, userId?: string) {
    const secret = randomBytes(32).toString('hex');
    const events = this.normalizeEvents(dto.events);

    const sub = this.subRepo.create({
      url: dto.url,
      events,
      secret,
      status: 'active',
      isActive: true,
      userId,
    });

    const saved = await this.subRepo.save(sub);

    // do NOT return secret (only show once if required)
    return {
      id: saved.id,
      url: saved.url,
      events: saved.events,
      status: saved.status,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
      signingSecret: secret,
    };
  }

  async list(userId?: string) {
    const where = userId ? { userId } : {};
    const subs = await this.subRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return subs.map((s) => ({
      id: s.id,
      url: s.url,
      events: s.events,
      status: s.status,
      isActive: s.isActive,
      createdAt: s.createdAt,
    }));
  }

  async toggle(id: string) {
    const sub = await this.subRepo.findOne({ where: { id } });

    if (!sub) {
      throw new NotFoundException(`Webhook subscription with ID ${id} not found`);
    }

    sub.isActive = !sub.isActive;
    sub.status = sub.isActive ? 'active' : 'disabled';

    const updated = await this.subRepo.save(sub);

    return {
      id: updated.id,
      url: updated.url,
      events: updated.events,
      status: updated.status,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    };
  }

  async update(id: string, dto: UpdateWebhookDto) {
    const update: UpdateWebhookDto = {
      ...dto,
      ...(dto.events ? { events: this.normalizeEvents(dto.events) } : {}),
    };

    await this.subRepo.update({ id }, update);
    const updated = await this.subRepo.findOne({ where: { id } });

    if (!updated) return null;

    return {
      id: updated.id,
      url: updated.url,
      events: updated.events,
      status: updated.status,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    };
  }

  async getActiveSubscriptionsForEvent(eventName: string) {
    return this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s."isActive" = :isActive', { isActive: true })
      .andWhere('s.events @> :event', { event: JSON.stringify([eventName]) })
      .getMany();
  }

  async getSecretByDeliveryId(deliveryId: string): Promise<string | null> {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) {
      return null;
    }

    const subscription = await this.subRepo.findOne({
      where: { id: delivery.subscriptionId },
    });

    return subscription?.secret ?? null;
  }

  private normalizeEvents(events: string[]): string[] {
    const normalizedEvents = [...new Set(events.map((event) => event.trim()))];
    const unsupportedEvents = normalizedEvents.filter(
      (event) => !WEBHOOK_EVENT_NAMES.includes(event),
    );

    if (unsupportedEvents.length > 0) {
      throw new BadRequestException(
        `Unsupported webhook events: ${unsupportedEvents.join(', ')}`,
      );
    }

    return normalizedEvents;
  }
}
