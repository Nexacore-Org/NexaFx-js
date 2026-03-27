import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import {
  NotificationLogEntity,
  NotificationLogStatus,
} from '../entities/notification-log.entity';
import {
  NotificationDeliveryReceiptEntity,
  DeliveryChannel,
  DeliveryStatus,
} from '../entities/notification-delivery-receipt.entity';

export interface NotificationLogFilter {
  userId?: string;
  notificationType?: string;
  channel?: string;
  status?: NotificationLogStatus;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface ChannelDeliveryRate {
  channel: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

@Injectable()
export class NotificationLogService {
  private readonly logger = new Logger(NotificationLogService.name);

  constructor(
    @InjectRepository(NotificationLogEntity)
    private readonly logRepository: Repository<NotificationLogEntity>,
    @InjectRepository(NotificationDeliveryReceiptEntity)
    private readonly receiptRepository: Repository<NotificationDeliveryReceiptEntity>,
  ) {}

  /**
   * Persist a notification log entry asynchronously (non-blocking).
   */
  logAsync(entry: {
    userId?: string | null;
    notificationType: string;
    channel?: string | null;
    status?: NotificationLogStatus;
    payload?: Record<string, any> | null;
    errorMessage?: string | null;
  }): void {
    this.logRepository
      .save(
        this.logRepository.create({
          userId: entry.userId ?? null,
          notificationType: entry.notificationType,
          channel: entry.channel ?? null,
          status: entry.status ?? NotificationLogStatus.SENT,
          payload: entry.payload ?? null,
          errorMessage: entry.errorMessage ?? null,
        }),
      )
      .catch((err) => this.logger.error(`Failed to write notification log: ${err.message}`, err.stack));
  }

  async getHistory(filter: NotificationLogFilter): Promise<{ logs: NotificationLogEntity[]; total: number }> {
    const where: FindOptionsWhere<NotificationLogEntity> = {};
    if (filter.userId) where.userId = filter.userId;
    if (filter.notificationType) where.notificationType = filter.notificationType;
    if (filter.channel) where.channel = filter.channel;
    if (filter.status) where.status = filter.status;
    if (filter.from && filter.to) {
      where.createdAt = Between(filter.from, filter.to);
    }

    const [logs, total] = await this.logRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    });

    return { logs, total };
  }

  async getAnalytics(): Promise<{
    volumeByType: { notificationType: string; count: number }[];
    channelDeliveryRates: ChannelDeliveryRate[];
    throttleStats: { throttled: number; sent: number; failed: number };
  }> {
    const volumeByType = await this.logRepository
      .createQueryBuilder('log')
      .select('log.notificationType', 'notificationType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.notificationType')
      .orderBy('count', 'DESC')
      .getRawMany<{ notificationType: string; count: string }>();

    const receiptStats = await this.receiptRepository
      .createQueryBuilder('r')
      .select('r.channel', 'channel')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN r.status = :success THEN 1 ELSE 0 END)', 'successCount')
      .addSelect('SUM(CASE WHEN r.status = :failed THEN 1 ELSE 0 END)', 'failedCount')
      .setParameter('success', DeliveryStatus.SUCCESS)
      .setParameter('failed', DeliveryStatus.FAILED)
      .groupBy('r.channel')
      .getRawMany<{ channel: string; total: string; successCount: string; failedCount: string }>();

    const channelDeliveryRates: ChannelDeliveryRate[] = receiptStats.map((row) => {
      const total = parseInt(row.total, 10);
      const success = parseInt(row.successCount, 10);
      const failed = parseInt(row.failedCount, 10);
      return {
        channel: row.channel,
        total,
        success,
        failed,
        successRate: total > 0 ? Math.round((success / total) * 100 * 100) / 100 : 0,
      };
    });

    const throttleStats = await this.logRepository
      .createQueryBuilder('log')
      .select('log.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.status')
      .getRawMany<{ status: string; count: string }>();

    const statsMap = Object.fromEntries(throttleStats.map((r) => [r.status, parseInt(r.count, 10)]));

    return {
      volumeByType: volumeByType.map((r) => ({ notificationType: r.notificationType, count: parseInt(r.count, 10) })),
      channelDeliveryRates,
      throttleStats: {
        throttled: statsMap['throttled'] ?? 0,
        sent: statsMap['sent'] ?? 0,
        failed: statsMap['failed'] ?? 0,
      },
    };
  }

  async getUserNotifications(userId: string): Promise<NotificationLogEntity[]> {
    return this.logRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /**
   * Purge notification logs older than 90 days.
   */
  async purgeOld(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await this.logRepository
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();

    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} notification logs older than 90 days`);
    }
    return deleted;
  }
}
