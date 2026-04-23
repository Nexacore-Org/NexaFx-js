import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  TransactionEntity,
  TransactionStatus,
} from '../../transactions/entities/transaction.entity';
import { TenantContextService } from '../../tenants/context/tenant-context.service';

export type AnalyticsPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface AnalyticsFilters {
  userId?: string | null;
  period?: AnalyticsPeriod;
  startDate?: Date;
  endDate?: Date;
}

interface Summary {
  volume: number;
  successRate: number;
  avgValue: number;
}

@Injectable()
export class TransactionAnalyticsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getAnalytics(filters: AnalyticsFilters) {
    const period = filters.period ?? 'DAILY';
    const [summary, comparison, categories, currencies, series] =
      await Promise.all([
        this.getSummary(filters),
        this.getPeriodComparison(filters),
        this.getCategoryBreakdown(filters),
        this.getCurrencyBreakdown(filters),
        this.getTimeSeries(filters),
      ]);

    return { period, summary, comparison, categories, currencies, series };
  }

  async getSummary(filters: AnalyticsFilters): Promise<Summary> {
    const txs = await this.scopedQuery(filters).getMany();
    const volume = txs.length;
    const successCount = txs.filter((tx) => this.isSuccess(tx.status)).length;
    const totalValue = txs.reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);

    return {
      volume,
      successRate: volume === 0 ? 0 : successCount / volume,
      avgValue: volume === 0 ? 0 : totalValue / volume,
    };
  }

  async getPeriodComparison(filters: AnalyticsFilters) {
    const currentRange = this.resolveRange(filters);
    const previousRange = this.previousRange(currentRange);

    const [current, previous] = await Promise.all([
      this.getSummary({ ...filters, ...currentRange }),
      this.getSummary({ ...filters, ...previousRange }),
    ]);

    return {
      current,
      previous,
      delta: {
        volume: current.volume - previous.volume,
        successRate: current.successRate - previous.successRate,
        avgValue: current.avgValue - previous.avgValue,
      },
    };
  }

  async getCategoryBreakdown(filters: AnalyticsFilters) {
    const txs = await this.scopedQuery(filters)
      .leftJoinAndSelect('tx.category', 'category')
      .getMany();
    const total = txs.reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
    const grouped = new Map<string, number>();

    for (const tx of txs) {
      const category =
        tx.category?.name ??
        String(tx.metadata?.category ?? tx.metadata?.merchantCategory ?? 'uncategorized');
      grouped.set(category, (grouped.get(category) ?? 0) + Number(tx.amount ?? 0));
    }

    return Array.from(grouped.entries())
      .map(([category, value]) => ({
        category,
        value,
        percentage: total === 0 ? 0 : value / total,
      }))
      .sort((a, b) => b.value - a.value);
  }

  async getCurrencyBreakdown(filters: AnalyticsFilters) {
    const txs = await this.scopedQuery(filters).getMany();
    const grouped = new Map<string, { volume: number; value: number }>();

    for (const tx of txs) {
      const currencyPair =
        tx.currencyPair ??
        String(tx.metadata?.currencyPair ?? tx.metadata?.pair ?? tx.currency);
      const current = grouped.get(currencyPair) ?? { volume: 0, value: 0 };
      current.volume += 1;
      current.value += Number(tx.amount ?? 0);
      grouped.set(currencyPair, current);
    }

    return Array.from(grouped.entries())
      .map(([currencyPair, stats]) => ({ currencyPair, ...stats }))
      .sort((a, b) => b.volume - a.volume);
  }

  async getTimeSeries(filters: AnalyticsFilters) {
    const range = this.resolveRange(filters);
    const txs = await this.scopedQuery(filters)
      .orderBy('tx.createdAt', 'ASC')
      .getMany();
    const grouped = new Map<string, number>();

    for (const tx of txs) {
      const timestamp = this.bucketTimestamp(tx.createdAt, filters.period ?? 'DAILY');
      grouped.set(timestamp, (grouped.get(timestamp) ?? 0) + Number(tx.amount ?? 0));
    }

    if (grouped.size === 0) {
      grouped.set(range.startDate.toISOString(), 0);
    }

    return Array.from(grouped.entries()).map(([timestamp, value]) => ({
      timestamp,
      value,
    }));
  }

  private scopedQuery(
    filters: AnalyticsFilters,
  ): SelectQueryBuilder<TransactionEntity> {
    const range = this.resolveRange(filters);
    const tenantId = this.tenantContext.getTenantId();
    const query = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.createdAt BETWEEN :startDate AND :endDate', range);

    if (filters.userId) {
      query.andWhere('tx.userId = :userId', { userId: filters.userId });
    }

    if (tenantId) {
      query.andWhere('tx.tenantId = :tenantId', { tenantId });
    }

    return query;
  }

  private resolveRange(filters: AnalyticsFilters): {
    startDate: Date;
    endDate: Date;
  } {
    const endDate = filters.endDate ?? new Date();
    if (filters.startDate) {
      return { startDate: filters.startDate, endDate };
    }

    const startDate = new Date(endDate);
    switch (filters.period ?? 'DAILY') {
      case 'WEEKLY':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'MONTHLY':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 1);
    }
    return { startDate, endDate };
  }

  private previousRange(range: { startDate: Date; endDate: Date }) {
    const duration = range.endDate.getTime() - range.startDate.getTime();
    return {
      startDate: new Date(range.startDate.getTime() - duration),
      endDate: new Date(range.startDate.getTime()),
    };
  }

  private bucketTimestamp(date: Date, period: AnalyticsPeriod): string {
    const bucket = new Date(date);
    bucket.setMinutes(0, 0, 0);
    if (period !== 'DAILY') {
      bucket.setHours(0, 0, 0, 0);
    }
    return bucket.toISOString();
  }

  private isSuccess(status: string): boolean {
    return status === TransactionStatus.SUCCESS || status === TransactionStatus.COMPLETED;
  }
}
