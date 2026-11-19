import { getCorrelationId } from '../common/middleware/correlation-id.storage';
import {
  ConflictException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
import { randomBytes, randomUUID } from 'crypto';
import { EncryptionService } from '../common/encryption/encryption.service';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { WebhookEndpoint } from './webhook-endpoint.entity';
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
} from './webhook-delivery.entity';
import { isCustomerWebhookEvent } from './webhook-events';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import {
  toWebhookEndpointResponse,
  WebhookEndpointResponseDto,
} from './dto/webhook-endpoint.dto';
import {
  assertPublicWebhookAddresses,
  resolveWebhookAddresses,
} from './webhook-ip';
import { sealWebhookSecret } from './webhook-secret';

export interface CreateWebhookEndpointDto {
  ownerId: string;
  url: string;
  events: string[];
}

export interface UpdateWebhookEndpointDto {
  url?: string;
  events?: string[];
}

export interface CreatedWebhookEndpoint {
  endpoint: WebhookEndpointResponseDto;
  secret: string;
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

/** Bound the recovery sweeps so one tick can never scan the whole table. */
const SWEEP_BATCH_SIZE = 100;
/** A PENDING row older than this with no live Bull job is considered stranded. */
const STALE_PENDING_MINUTES = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deliveryJobOptions(deliveryId: string) {
  return {
    jobId: deliveryId,
    attempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS || '5'),
    backoff: {
      type: 'exponential' as const,
      delay: Number(process.env.WEBHOOK_BACKOFF_DELAY_MS || '1000'),
    },
    removeOnComplete: true,
    removeOnFail: true,
  };
}

const MAX_ENDPOINTS_PER_USER =
  parseInt(process.env.WEBHOOK_MAX_ENDPOINTS_PER_USER ?? '10', 10) || 10;

async function validateWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Webhook URL is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL must use HTTPS');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new BadRequestException(
      'Webhook URL must not target localhost or link-local addresses',
    );
  }

  try {
    const addresses = await resolveWebhookAddresses(hostname);
    assertPublicWebhookAddresses(addresses);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid address';
    throw new BadRequestException(
      `Webhook URL is not permitted: ${detail}`,
    );
  }
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointsRepository: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveriesRepository: Repository<WebhookDelivery>,
    private readonly encryption: EncryptionService,
    @Optional()
    @InjectQueue(QUEUE_NAMES.WEBHOOKS)
    private readonly webhooksQueue?: Queue,
  ) {}

  async createEndpoint(dto: CreateWebhookEndpointDto): Promise<CreatedWebhookEndpoint> {
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

    // 32 random bytes, generated here so clients cannot reuse a weak secret.
    const secret = randomBytes(32).toString('hex');
    const endpoint = this.endpointsRepository.create({
      ownerId: dto.ownerId,
      url: dto.url,
      events: dto.events,
      secret: sealWebhookSecret(this.encryption, secret),
      isActive: true,
    });
    const saved = await this.endpointsRepository.save(endpoint);
    return { endpoint: toWebhookEndpointResponse(saved), secret };
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

  async listEndpoints(ownerId: string): Promise<WebhookEndpointResponseDto[]> {
    const endpoints = await this.endpointsRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
    return endpoints.map(toWebhookEndpointResponse);
  }

  async getEndpoint(
    ownerId: string,
    endpointId: string,
  ): Promise<WebhookEndpointResponseDto> {
    return toWebhookEndpointResponse(
      await this.findEndpointForOwner(endpointId, ownerId),
    );
  }

  async updateEndpoint(
    ownerId: string,
    endpointId: string,
    dto: UpdateWebhookEndpointDto,
  ): Promise<WebhookEndpointResponseDto> {
    const endpoint = await this.findEndpointForOwner(endpointId, ownerId);
    if (dto.url !== undefined) {
      await validateWebhookUrl(dto.url);
      endpoint.url = dto.url;
    }
    if (dto.events !== undefined) {
      this.assertSubscribableEvents(dto.events);
      endpoint.events = dto.events;
    }
    return toWebhookEndpointResponse(await this.endpointsRepository.save(endpoint));
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
    if (targets.length === 0) {
      return;
    }

    const correlationId = getCorrelationId();
    const newDeliveries = targets.map((endpoint) =>
      this.deliveriesRepository.create({
        id: randomUUID(),
        endpointId: endpoint.id,
        eventName,
        requestBody: this.buildRecipientPayload(endpoint.ownerId, payload),
        attemptCount: 0,
        status: WebhookDeliveryStatus.PENDING,
      }),
    );

    // One insert for the whole event (#1612). The UUIDs are generated here so
    // re-running the insert or the enqueue below cannot create duplicate rows.
    const saved = await this.deliveriesRepository.save(newDeliveries);
    const deliveries = Array.isArray(saved) ? saved : [saved];

    const jobs = deliveries.map((delivery) => ({
      name: 'deliver',
      data: { deliveryId: delivery.id, correlationId },
      opts: deliveryJobOptions(delivery.id),
    }));

    try {
      await this.webhooksQueue.addBulk(jobs);
    } catch (bulkError) {
      // A Redis blip must neither strand these rows as PENDING nor stop the
      // other endpoints being queued. `jobId` makes re-adding safe if the bulk
      // call partially succeeded before throwing.
      const failed: WebhookDelivery[] = [];
      for (const [index, job] of jobs.entries()) {
        const delivery = deliveries[index];
        if (!delivery) continue;
        try {
          await this.webhooksQueue.add(job.name, job.data, job.opts);
        } catch (addError) {
          delivery.status = WebhookDeliveryStatus.FAILED;
          delivery.errorMessage =
            `Failed to enqueue webhook delivery: ${errorMessage(addError)}`;
          failed.push(delivery);
        }
      }
      if (failed.length > 0) {
        await this.deliveriesRepository.save(failed);
      }
      this.logger.warn(
        `Bulk webhook enqueue failed (${errorMessage(bulkError)}); ` +
          `${failed.length}/${deliveries.length} delivery(ies) marked FAILED`,
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
  }

  /**
   * Re-enqueue failed deliveries whose backoff has elapsed (#1612).
   * Bull's processor performs the HTTP retry; this sweep only repairs rows
   * whose job was lost or was never created.
   */
  async recoverFailedDeliveries(): Promise<number> {
    const due = await this.deliveriesRepository.find({
      where: {
        status: WebhookDeliveryStatus.FAILED,
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      take: SWEEP_BATCH_SIZE,
      order: { updatedAt: 'ASC' },
    });
    return this.enqueueStoredDeliveries(
      due.filter((delivery) => delivery.retryCount < delivery.maxRetries),
    );
  }

  /**
   * Re-enqueue PENDING rows stranded for a few minutes with no live job
   * (#1612) — for example when the process died between the insert and the
   * enqueue, or when a bulk enqueue failed but its fallback also missed a row.
   */
  async recoverStuckPendingDeliveries(
    staleAfterMinutes: number = STALE_PENDING_MINUTES,
  ): Promise<number> {
    const minutes =
      Number.isFinite(staleAfterMinutes) && staleAfterMinutes > 0
        ? staleAfterMinutes
        : STALE_PENDING_MINUTES;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const stale = await this.deliveriesRepository.find({
      where: {
        status: WebhookDeliveryStatus.PENDING,
        createdAt: LessThan(cutoff),
      },
      take: SWEEP_BATCH_SIZE,
      order: { createdAt: 'ASC' },
    });
    return this.enqueueStoredDeliveries(stale, true);
  }

  /**
   * Re-queue one of the caller's failed deliveries (backing the manual retry
   * endpoint, #1588). Ownership is enforced by {@link findDeliveryForOwner} so
   * no authenticated user can re-fire another tenant's delivery.
   */
  async retryDeliveryForOwner(
    deliveryId: string,
    ownerId: string,
  ): Promise<{ deliveryId: string; status: string }> {
    const delivery = await this.findDeliveryForOwner(deliveryId, ownerId);

    if (
      delivery.status !== WebhookDeliveryStatus.FAILED &&
      delivery.status !== WebhookDeliveryStatus.EXPIRED
    ) {
      throw new BadRequestException(
        `Only FAILED or EXPIRED deliveries can be retried (current: ${delivery.status})`,
      );
    }

    // The original job used the delivery id as its jobId, which Bull rejects
    // while that job still exists, so each manual retry gets a fresh one.
    await this.webhooksQueue.add(
      'deliver',
      { deliveryId, correlationId: getCorrelationId() },
      deliveryJobOptions(`${deliveryId}:retry:${Date.now()}`),
    );

    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.errorMessage = null;
    delivery.nextRetryAt = null;
    delivery.retryCount = 0;
    await this.deliveriesRepository.save(delivery);
    return { deliveryId, status: 'queued' };
  }

  private async enqueueStoredDeliveries(
    deliveries: WebhookDelivery[],
    skipLiveJobs = false,
  ): Promise<number> {
    let requeued = 0;
    for (const delivery of deliveries) {
      try {
        if (
          skipLiveJobs &&
          typeof this.webhooksQueue.getJob === 'function' &&
          (await this.webhooksQueue.getJob(delivery.id))
        ) {
          continue;
        }
        await this.webhooksQueue.add(
          'deliver',
          { deliveryId: delivery.id, correlationId: getCorrelationId() },
          deliveryJobOptions(delivery.id),
        );
        requeued++;
      } catch (error) {
        this.logger.warn(
          `Failed to re-enqueue webhook delivery ${delivery.id}: ` +
            errorMessage(error),
        );
      }
    }
    return requeued;
  }

  /**
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
