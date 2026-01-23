import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';

import { WebhookSubscriptionEntity } from './entities/webhook-subscription.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookSubscriptionEntity)
    private readonly subRepo: Repository<WebhookSubscriptionEntity>,
  ) {}

  async create(dto: CreateWebhookDto) {
    const secret = randomBytes(32).toString('hex');

    const sub = this.subRepo.create({
      url: dto.url,
      events: dto.events,
      secret,
      status: 'active',
    });

    const saved = await this.subRepo.save(sub);

    // do NOT return secret (only show once if required)
    return {
      id: saved.id,
      url: saved.url,
      events: saved.events,
      status: saved.status,
      createdAt: saved.createdAt,
    };
  }

  async list() {
    const subs = await this.subRepo.find({
      order: { createdAt: 'DESC' },
    });

    return subs.map((s) => ({
      id: s.id,
      url: s.url,
      events: s.events,
      status: s.status,
      createdAt: s.createdAt,
    }));
  }

  async update(id: string, dto: UpdateWebhookDto) {
    await this.subRepo.update({ id }, dto);
    const updated = await this.subRepo.findOne({ where: { id } });

    if (!updated) return null;

    return {
      id: updated.id,
      url: updated.url,
      events: updated.events,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  }

  async getActiveSubscriptionsForEvent(eventName: string) {
    return this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.events @> :event', { event: JSON.stringify([eventName]) })
      .getMany();
  }
}
