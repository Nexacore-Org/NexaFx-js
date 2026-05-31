import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { WebhookEndpoint } from './webhook-endpoint.entity';
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
} from './webhook-delivery.entity';

export interface CreateWebhookEndpointDto {
  ownerId: string;
  url: string;
  secret: string;
  events: string[];
}

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointsRepository: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepository: Repository<WebhookDelivery>,
    @InjectQueue('webhooks')
    private readonly webhooksQueue: Queue,
  ) {}

  async createEndpoint(
    dto: CreateWebhookEndpointDto,
  ): Promise<WebhookEndpoint> {
    const endpoint = this.endpointsRepository.create({
      ...dto,
      isActive: true,
    });
    return this.endpointsRepository.save(endpoint);
  }

  async listEndpoints(ownerId: string): Promise<WebhookEndpoint[]> {
    return this.endpointsRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  async listDeliveries(
    ownerId: string,
    endpointId?: string,
  ): Promise<WebhookDelivery[]> {
    const endpoints = await this.endpointsRepository.find({
      where: { ownerId },
    });
    const allowedIds = new Set(endpoints.map((endpoint) => endpoint.id));

    const deliveries = await this.deliveriesRepository.find({
      order: { createdAt: 'DESC' },
    });

    return deliveries.filter((delivery) => {
      if (!allowedIds.has(delivery.endpointId)) {
        return false;
      }
      return endpointId ? delivery.endpointId === endpointId : true;
    });
  }

  async dispatchEvent(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.endpointsRepository.find({
      where: { isActive: true },
    });
    const targets = endpoints.filter((endpoint) =>
      endpoint.events.includes(eventName),
    );

    for (const endpoint of targets) {
      const delivery = await this.deliveriesRepository.save(
        this.deliveriesRepository.create({
          id: randomUUID(),
          endpointId: endpoint.id,
          eventName,
          requestBody: payload,
          attemptCount: 0,
          status: WebhookDeliveryStatus.PENDING,
        }),
      );

      await this.webhooksQueue.add(
        'deliver',
        {
          deliveryId: delivery.id,
        },
        {
          jobId: delivery.id,
          attempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS || '5'),
          backoff: {
            type: 'exponential',
            delay: Number(process.env.WEBHOOK_BACKOFF_DELAY_MS || '1000'),
          },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
  }

  async findEndpointForOwner(
    endpointId: string,
    ownerId: string,
  ): Promise<WebhookEndpoint> {
    const endpoint = await this.endpointsRepository.findOne({
      where: { id: endpointId, ownerId },
    });
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint ${endpointId} not found`);
    }
    return endpoint;
  }

  async findDeliveryForOwner(
    deliveryId: string,
    ownerId: string,
  ): Promise<WebhookDelivery> {
    const delivery = await this.deliveriesRepository
      .createQueryBuilder('delivery')
      .innerJoin(
        WebhookEndpoint,
        'endpoint',
        'endpoint.id = delivery.endpointId',
      )
      .where('delivery.id = :deliveryId', { deliveryId })
      .andWhere('endpoint.ownerId = :ownerId', { ownerId })
      .getOne();

    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${deliveryId} not found`);
    }

    return delivery;
  }
}
