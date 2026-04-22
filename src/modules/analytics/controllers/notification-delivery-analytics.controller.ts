import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationDeliveryReceiptEntity,
  DeliveryChannel,
  DeliveryStatus,
} from '../../notifications/entities/notification-delivery-receipt.entity';

@Controller('admin/analytics/notifications')
export class NotificationDeliveryAnalyticsController {
  constructor(
    @InjectRepository(NotificationDeliveryReceiptEntity)
    private readonly receiptRepo: Repository<NotificationDeliveryReceiptEntity>,
  ) {}

  /**
   * GET /admin/analytics/notifications/delivery
   * Returns per-channel success rates and counts.
   */
  @Get('delivery')
  async getDeliveryStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const qb = this.receiptRepo.createQueryBuilder('r');

    if (from) qb.andWhere('r.created_at >= :from', { from: new Date(from) });
    if (to) qb.andWhere('r.created_at <= :to', { to: new Date(to) });

    const rows = await qb
      .select('r.channel', 'channel')
      .addSelect('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.channel')
      .addGroupBy('r.status')
      .getRawMany<{ channel: DeliveryChannel; status: DeliveryStatus; count: string }>();

    // Aggregate into per-channel stats
    const channelMap: Record<
      string,
      { total: number; success: number; failed: number; successRate: number }
    > = {};

    for (const row of rows) {
      const ch = row.channel;
      if (!channelMap[ch]) channelMap[ch] = { total: 0, success: 0, failed: 0, successRate: 0 };
      const count = parseInt(row.count, 10);
      channelMap[ch].total += count;
      if (row.status === DeliveryStatus.SUCCESS) channelMap[ch].success += count;
      if (row.status === DeliveryStatus.FAILED) channelMap[ch].failed += count;
    }

    for (const ch of Object.keys(channelMap)) {
      const s = channelMap[ch];
      s.successRate = s.total > 0 ? Math.round((s.success / s.total) * 10000) / 100 : 0;
    }

    return {
      success: true,
      data: channelMap,
      generatedAt: new Date().toISOString(),
    };
  }
}
