import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { NotificationEntity } from '../entities/notification.entity';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationPersistenceService {
  private readonly logger = new Logger(NotificationPersistenceService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  async create(input: CreateNotificationInput): Promise<NotificationEntity> {
    const entity = this.repo.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
      isRead: false,
      isArchived: false,
    });
    return this.repo.save(entity);
  }

  async findPaginated(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: NotificationEntity[]; total: number; unreadCount: number }> {
    const offset = (page - 1) * limit;

    const [items, total] = await this.repo.findAndCount({
      where: { userId, isArchived: false },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const unreadCount = await this.repo.count({
      where: { userId, isRead: false, isArchived: false },
    });

    return { items, total, unreadCount };
  }

  async markRead(id: string, userId: string): Promise<NotificationEntity> {
    const notification = await this.repo.findOne({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.repo.save(notification);
    }

    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true, readAt: new Date() })
      .where('userId = :userId AND isRead = false AND isArchived = false', { userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false, isArchived: false } });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async archiveOld(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const result = await this.repo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isArchived: true })
      .where('createdAt < :cutoff AND isArchived = false', { cutoff })
      .execute();

    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Archived ${result.affected} notifications older than 90 days`);
    }
  }
}
