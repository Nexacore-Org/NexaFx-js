import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import * as dns from 'dns';
import * as net from 'net';
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

const MAX_ENDPOINTS_PER_USER =
  parseInt(process.env.WEBHOOK_MAX_ENDPOINTS_PER_USER ?? '10', 10) || 10;
const PRIVATE_CIDR_RANGES = [
  { start: ip2int('10.0.0.0'), end: ip2int('10.255.255.255') },
  { start: ip2int('172.16.0.0'), end: ip2int('172.31.255.255') },
  { start: ip2int('192.168.0.0'), end: ip2int('192.168.255.255') },
  { start: ip2int('127.0.0.0'), end: ip2int('127.255.255.255') },
  { start: ip2int('169.254.0.0'), end: ip2int('169.254.255.255') },
  { start: ip2int('100.64.0.0'), end: ip2int('100.127.255.255') },
];

function ip2int(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) return true;
  const n = ip2int(ip);
  return PRIVATE_CIDR_RANGES.some((r) => n >= r.start && n <= r.end);
}

async function resolveAndRejectPrivate(hostname: string): Promise<void> {
  const addresses = await new Promise<string[]>((resolve, reject) => {
    dns.resolve4(hostname, (err, addrs) => {
      if (err) reject(err);
      else resolve(addrs);
    });
  });
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new BadRequestException(
        `Webhook URL resolves to a private/internal IP address (${addr}) — SSRF not permitted`,
      );
    }
  }
}

async function validateWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Webhook URL is not a valid URL');
  }

  const hostname = parsed.hostname;

  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  ) {
    throw new BadRequestException(
      'Webhook URL must not target localhost or link-local addresses',
    );
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new BadRequestException(
        'Webhook URL must not target private or internal IP ranges',
      );
    }
  } else {
    await resolveAndRejectPrivate(hostname);
  }
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
    const activeCount = await this.endpointsRepository.count({
      where: { ownerId: dto.ownerId, isActive: true },
    });
    if (activeCount >= MAX_ENDPOINTS_PER_USER) {
      throw new ConflictException(
        `Maximum of ${MAX_ENDPOINTS_PER_USER} active webhook endpoints per user reached`,
      );
    }
    await validateWebhookUrl(dto.url);

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

  async countActiveEndpoints(ownerId: string): Promise<number> {
    return this.endpointsRepository.count({ where: { ownerId, isActive: true } });
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
        { deliveryId: delivery.id },
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
