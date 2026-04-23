import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsFilters } from './transaction-analytics.service';
import {
  TransactionEntity,
  TransactionStatus,
} from '../../transactions/entities/transaction.entity';
import { TransactionRiskEntity } from '../../transactions/entities/transaction-risk.entity';
import { TenantContextService } from '../../tenants/context/tenant-context.service';

type Bucket = '0-20' | '21-40' | '41-60' | '61-80' | '81-100';

@Injectable()
export class FraudAnalyticsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionRiskEntity)
    private readonly riskRepo: Repository<TransactionRiskEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getDashboard(filters: AnalyticsFilters) {
    const [riskDistribution, counts, ruleEffectiveness] = await Promise.all([
      this.getRiskDistribution(filters),
      this.getFlagCounts(filters),
      this.getRuleEffectiveness(filters),
    ]);

    return {
      riskDistribution,
      counts,
      ruleEffectiveness,
    };
  }

  async getRiskDistribution(filters: AnalyticsFilters) {
    const txs = await this.scopedTransactionQuery(filters).getMany();
    const buckets: Record<Bucket, number> = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    };

    for (const tx of txs) {
      const score = Math.max(0, Math.min(100, tx.riskScore ?? 0));
      if (score <= 20) buckets['0-20'] += 1;
      else if (score <= 40) buckets['21-40'] += 1;
      else if (score <= 60) buckets['41-60'] += 1;
      else if (score <= 80) buckets['61-80'] += 1;
      else buckets['81-100'] += 1;
    }

    return buckets;
  }

  async getFlagCounts(filters: AnalyticsFilters) {
    const txs = await this.scopedTransactionQuery(filters).getMany();

    return {
      flagged: txs.filter((tx) => tx.isFlagged || tx.requiresManualReview).length,
      autoResolved: txs.filter(
        (tx) => tx.status === TransactionStatus.AUTO_RESOLVED,
      ).length,
      escalated: txs.filter(
        (tx) =>
          tx.status === TransactionStatus.ESCALATED ||
          tx.reviewStatus === 'ESCALATED',
      ).length,
    };
  }

  async getRuleEffectiveness(filters: AnalyticsFilters) {
    const range = this.resolveRange(filters);
    const risks = await this.riskRepo
      .createQueryBuilder('risk')
      .leftJoinAndSelect('risk.transaction', 'tx')
      .where('risk.createdAt BETWEEN :startDate AND :endDate', range)
      .getMany();

    const tenantId = this.tenantContext.getTenantId();
    const scopedRisks = tenantId
      ? risks.filter((risk) => risk.transaction?.tenantId === tenantId)
      : risks;
    const grouped = new Map<string, { count: number; tp: number; fp: number }>();

    for (const risk of scopedRisks) {
      for (const factor of risk.riskFactors ?? []) {
        const stats = grouped.get(factor.rule) ?? { count: 0, tp: 0, fp: 0 };
        stats.count += 1;
        if (risk.reviewStatus === 'REJECTED') stats.tp += 1;
        if (risk.reviewStatus === 'APPROVED') stats.fp += 1;
        grouped.set(factor.rule, stats);
      }
    }

    const totalTriggers = Array.from(grouped.values()).reduce(
      (sum, stats) => sum + stats.count,
      0,
    );

    return Array.from(grouped.entries())
      .map(([rule, stats]) => ({
        rule,
        count: stats.count,
        triggerRate: totalTriggers === 0 ? 0 : stats.count / totalTriggers,
        truePositiveRate: stats.count === 0 ? 0 : stats.tp / stats.count,
        falsePositiveRate: stats.count === 0 ? 0 : stats.fp / stats.count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getHeatmap(filters: AnalyticsFilters) {
    const heatmap = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      hours: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
    }));
    const txs = await this.scopedTransactionQuery(filters)
      .andWhere('(tx.isFlagged = :flagged OR tx.requiresManualReview = :review)', {
        flagged: true,
        review: true,
      })
      .getMany();

    for (const tx of txs) {
      const createdAt = new Date(tx.createdAt);
      heatmap[createdAt.getDay()].hours[createdAt.getHours()].count += 1;
    }

    return heatmap;
  }

  private scopedTransactionQuery(filters: AnalyticsFilters) {
    const range = this.resolveRange(filters);
    const tenantId = this.tenantContext.getTenantId();
    const query = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.createdAt BETWEEN :startDate AND :endDate', range);

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
}
