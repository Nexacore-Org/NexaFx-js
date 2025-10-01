import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Webhook, WebhookEvent } from './entities/webhook.entity';

@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    @InjectQueue('webhook-delivery') private readonly deliveryQueue: Queue,
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
  ) {}

  async dispatchEvent(eventName: WebhookEvent, payload: Record<string, any>) {
    this.logger.log(`Dispatching event: ${eventName}`);
    const subscribedWebhooks = await this.webhookRepository.find({
      where: {
        isActive: true,
        subscribedEvents: In([eventName]),
      },
    });

    for (const webhook of subscribedWebhooks) {
      await this.deliveryQueue.add('dispatch-webhook', {
        webhookId: webhook.id,
        eventName,
        payload,
      });
    }
  }
}