import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import {
  Between,
  FindOptionsWhere,
  In,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import * as dns from 'dns';
import * as net from 'net';
import { WebhookEndpoint } from './webhook-endpoint.entity';
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
} from './webhook-delivery.entity';
import { isCustomerWebhookEvent } from './webhook-events';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';

export interface CreateWebhookEndpointDto {
  ownerId: string;
  url: string;
  secret: string;
  events: string[];
}

/** A delivery row without its (potentially large) stored request body. */
export type DeliverySummary = Omit<WebhookDelivery, 'requestBody'>;

export interface PaginatedDeliveries {
  items: DeliverySummary[];
  total: number;
  page: number;
  limit: number;
}

export const DEFAULT_DELIVERY_PAGE_SIZE = 20;
export const MAX_DELIVERY_PAGE_SIZE = 100;

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
  return (
    ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
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
    this.assertSubscribableEvents(dto.events);

    const endpoint = this.endpointsRepository.create({
      ...dto,
      isActive: true,
    });
    return this.endpointsRepository.save(endpoint);
  }

  /**
   * Reject any subscription to an event that is not customer-facing (#1444).
   * Previously any authenticated user could subscribe to `transactions.completed`
   * or `aml.alert.created` and receive every tenant's data.
   */
  private assertSubscribableEvents(events: string[]): void {
    if (!events || events.length === 0) {
      throw new BadRequestException(
        'At least one webhook event must be subscribed to',
      );
    }
    const rejected = events.filter((event) => !isCustomerWebhookEvent(event));
    if (rejected.length > 0) {
      throw new BadRequestException(
        `Cannot subscribe to non-customer-facing webhook event(s): ${rejected.join(
          ', ',
        )}`,
      );
    }
  }

  async listEndpoints(ownerId: string): Promise<WebhookEndpoint[]> {
    return this.endpointsRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  async countActiveEndpoints(ownerId: string): Promise<number> {
    return this.endpointsRepository.count({
      where: { ownerId, isActive: true },
    });
  }

  /**
   * Paginated delivery history for the caller's endpoints (#1446).
   *
   * Runs one bounded query joined to `webhook_endpoints` so only the caller's
   * deliveries are ever read — the previous implementation loaded the entire
   * table into memory and filtered in JavaScript. The stored `requestBody` is
   * excluded from the list; fetch a single delivery to see the full payload.
   *
   * Throws 404 when `endpointId` is supplied but not owned by `ownerId`,
   * instead of silently returning an empty page.
   */
  async listDeliveries(
    ownerId: string,
    endpointId?: string,
    query: ListDeliveriesQueryDto = {},
  ): Promise<PaginatedDeliveries> {
    if (endpointId) {
      await this.findEndpointForOwner(endpointId, ownerId);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(
      query.limit && query.limit > 0 ? query.limit : DEFAULT_DELIVERY_PAGE_SIZE,
      MAX_DELIVERY_PAGE_SIZE,
    );

    const where: FindOptionsWhere<WebhookDelivery> = {
      // Constrain to the caller's endpoints; when a specific endpoint is
      // requested the ownership check above already proved it belongs to them.
      endpointId: endpointId
        ? endpointId
        : In(
            (await this.endpointsRepository.find({ where: { ownerId } })).map(
              (e) => e.id,
            ),
          ),
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.from && query.to) {
      where.createdAt = Between(new Date(query.from), new Date(query.to));
    } else if (query.from) {
      where.createdAt = MoreThanOrEqual(new Date(query.from));
    } else if (query.to) {
      where.createdAt = LessThanOrEqual(new Date(query.to));
    }

    const [rows, total] = await this.deliveriesRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const items: DeliverySummary[] = rows.map((row) => {
      const summary = { ...row } as Record<string, unknown>;
      delete summary.requestBody;
      return summary as unknown as DeliverySummary;
    });

    return { items, total, page, limit };
  }

  /**
   * Deliver a domain event to the active endpoints owned by the parties to the
   * event (#1444).
   *
   * `ownerIds` is mandatory: a dispatched event has an owner set derived from
   * the event, and only those owners' endpoints are considered. The previous
   * implementation targeted every active endpoint subscribed to the event name,
   * so any subscriber received every tenant's payloads.
   *
   * Each recipient gets a payload built from `payload` via
   * {@link buildRecipientPayload}, so a party only ever sees their own side of
   * an event (e.g. a transfer counterparty is masked).
   */
  async dispatchEvent(
    eventName: string,
    ownerIds: string[],
    payload: Record<string, unknown>,
  ): Promise<void> {
    const owners = [...new Set(ownerIds.filter(Boolean))];
    if (owners.length === 0) {
      return;
    }

    // Internal/compliance events must never reach customer webhooks (#1444).
    if (!isCustomerWebhookEvent(eventName)) {
      return;
    }

    const endpoints = await this.endpointsRepository.find({
      where: { isActive: true, ownerId: In(owners) },
    });
    const targets = endpoints.filter((endpoint) =>
      endpoint.events.includes(eventName),
    );

    for (const endpoint of targets) {
      const recipientPayload = this.buildRecipientPayload(
        endpoint.ownerId,
        payload,
      );

      const delivery = await this.deliveriesRepository.save(
        this.deliveriesRepository.create({
          id: randomUUID(),
          endpointId: endpoint.id,
          eventName,
          requestBody: recipientPayload,
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

  /**
   * Reduce a platform-wide event payload to what a single `ownerId` should
   * see. For a transfer, both sender and receiver received the full
   * `senderId`/`receiverId`/`amount`/`reference`; each side now sees only its
   * own perspective, with the counterparty id masked.
   */
  private buildRecipientPayload(
    ownerId: string,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const senderId = payload.senderId as string | undefined;
    const receiverId = payload.receiverId as string | undefined;

    if (senderId || receiverId) {
      const isSender = ownerId === senderId;
      const isReceiver = ownerId === receiverId;

      // Defensive: if the owner is somehow not a party, expose nothing.
      if (!isSender && !isReceiver) {
        return { transactionId: payload.transactionId };
      }

      return {
        transactionId: payload.transactionId,
        direction: isSender ? 'outgoing' : 'incoming',
        counterpartyId: isSender ? receiverId : senderId,
        amount: payload.amount,
        currency: payload.currency,
        reference: payload.reference,
        timestamp: payload.timestamp,
      };
    }

    // Single-sided events (deposit/withdrawal/swap/reversal) carry no
    // counterparty, so the payload is already scoped to the owner.
    return payload;
   * Delete deliveries older than `retentionDays` (#1446). Retention is opt-in:
   * a non-positive or unset value prunes nothing, so nothing is deleted by
   * accident. Returns the number of rows removed.
   */
  async pruneExpiredDeliveries(retentionDays: number): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return 0;
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.deliveriesRepository.delete({
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
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
