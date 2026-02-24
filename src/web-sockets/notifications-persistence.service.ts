import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull, LessThan } from 'typeorm';
import { PersistedNotification } from './entities/persisted-notification.entity';
import { NotificationEvent } from './notifications.constants';
import {
  MAX_MISSED_EVENTS_PER_USER,
  MISSED_EVENTS_TTL_SECONDS,
} from './notifications.constants';

export interface NotificationPayload {
  event: NotificationEvent;
  payload: Record<string, unknown>;
  userId?: string;
}

@Injectable()
export class NotificationsPersistenceService {
  private readonly logger = new Logger(NotificationsPersistenceService.name);

  constructor(
    @InjectRepository(PersistedNotification)
    private readonly repo: Repository<PersistedNotification>,
  ) {}

  async persist(notification: NotificationPayload): Promise<PersistedNotification> {
    const expiresAt = new Date(Date.now() + MISSED_EVENTS_TTL_SECONDS * 1000);
    const entity = this.repo.create({
      userId: notification.userId ?? null,
      event: notification.event,
      payload: notification.payload,
      delivered: false,
      expiresAt,
    });
    return this.repo.save(entity);
  }

  async markDelivered(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.repo.update(ids, { delivered: true, deliveredAt: new Date() });
  }

  async getMissedEvents(
    userId: string,
    since: Date,
    limit = 50,
  ): Promise<PersistedNotification[]> {
    return this.repo.find({
      where: [
        { userId, delivered: false, createdAt: MoreThan(since) },
        { userId: IsNull(), delivered: false, createdAt: MoreThan(since) },
      ],
      order: { createdAt: 'ASC' },
      take: Math.min(limit, MAX_MISSED_EVENTS_PER_USER),
    });
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.repo.increment({ id }, 'deliveryAttempts', 1);
  }

  /** Housekeeping — call via cron */
  async pruneExpired(): Promise<number> {
    const result = await this.repo.delete({
      expiresAt: LessThan(new Date()),
    });
    const count = result.affected ?? 0;
    if (count > 0) {
      this.logger.log(`Pruned ${count} expired notifications`);
    }
    return count;
  }
}
