import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeRuleEntity } from '../../fee/entities/fee-rule.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { AnalyticsFilters, AnalyticsPeriod } from './transaction-analytics.service';
import { TenantContextService } from '../../tenants/context/tenant-context.service';

interface FeeSample {
  amount: number;
  currency: string;
  type: string;
  createdAt: Date;
}

@Injectable()
export class RevenueAnalyticsService {
  constructor(
    @InjectRepository(FeeRuleEntity)
    private readonly feeRuleRepo: Repository<FeeRuleEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getRevenueSummary(filters: AnalyticsFilters = {}) {
    const period = filters.period ?? 'DAILY';
    const range = this.resolveRange({ ...filters, period });
    const previousRange = this.previousRange(range);
    const [currentFees, previousFees] = await Promise.all([
      this.getFeeSamples(range),
      this.getFeeSamples(previousRange),
    ]);
    const totalFees = this.sum(currentFees);
    const previousTotal = this.sum(previousFees);

    return {
      totalFees,
      avgFeePerTransaction:
        currentFees.length === 0 ? 0 : totalFees / currentFees.length,
      feeByType: this.groupBy(currentFees, 'type'),
      feeByCurrency: this.groupBy(currentFees, 'currency'),
      periodComparison: {
        previous: previousTotal,
        current: totalFees,
        change:
          previousTotal === 0
            ? totalFees
            : (totalFees - previousTotal) / previousTotal,
      },
      projection: this.projectRevenue(currentFees, period),
    };
  }

  private async getFeeSamples(range: { startDate: Date; endDate: Date }) {
    const tenantId = this.tenantContext.getTenantId();
    const txQuery = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.createdAt BETWEEN :startDate AND :endDate', range);

    if (tenantId) {
      txQuery.andWhere('tx.tenantId = :tenantId', { tenantId });
    }

    const [transactions, rules] = await Promise.all([
      txQuery.getMany(),
      this.feeRuleRepo.find({ where: { isActive: true } }),
    ]);

    return transactions.map((tx) => {
      const explicitFee = Number(
        tx.metadata?.feeAmount ??
          tx.metadata?.fee ??
          tx.metadata?.fees?.total ??
          Number.NaN,
      );
      const rule = this.findRule(rules, tx);
      const amount = Number.isFinite(explicitFee)
        ? explicitFee
        : this.estimateFee(Number(tx.amount ?? 0), rule);

      return {
        amount,
        currency: tx.currency,
        type: String(tx.metadata?.feeType ?? rule?.ruleType ?? 'ESTIMATED'),
        createdAt: tx.createdAt,
      };
    });
  }

  private findRule(rules: FeeRuleEntity[], tx: TransactionEntity) {
    const amount = Number(tx.amount ?? 0);
    return rules
      .filter((rule) => {
        if (rule.currency !== tx.currency) return false;
        if (rule.minAmount && amount < Number(rule.minAmount)) return false;
        if (rule.maxAmount && amount > Number(rule.maxAmount)) return false;
        return true;
      })
      .sort((a, b) => a.priority - b.priority)[0];
  }

  private estimateFee(amount: number, rule?: FeeRuleEntity) {
    if (!rule) return 0;
    const percentageFee = rule.percentage
      ? (amount * Number(rule.percentage)) / 100
      : 0;
    const flatFee = rule.flatFee ? Number(rule.flatFee) : 0;
    return percentageFee + flatFee;
  }

  private projectRevenue(fees: FeeSample[], period: AnalyticsPeriod) {
    const currentTotal = this.sum(fees);
    const divisor = period === 'DAILY' ? 1 : period === 'WEEKLY' ? 7 : 30;
    const dailyAverage = currentTotal / divisor;
    const values = fees.map((fee) => fee.amount);
    const variance =
      values.length === 0
        ? 0
        : values.reduce((sum, value) => sum + Math.abs(value - dailyAverage), 0) /
          values.length;
    const confidence = Math.max(0.35, Math.min(0.95, 1 - variance / (currentTotal || 1)));

    return {
      forecast7d: dailyAverage * 7,
      forecast30d: dailyAverage * 30,
      confidence,
      confidenceInterval: {
        low7d: Math.max(0, dailyAverage * 7 * (1 - (1 - confidence))),
        high7d: dailyAverage * 7 * (1 + (1 - confidence)),
        low30d: Math.max(0, dailyAverage * 30 * (1 - (1 - confidence))),
        high30d: dailyAverage * 30 * (1 + (1 - confidence)),
      },
      label: 'estimate',
    };
  }

  private groupBy(fees: FeeSample[], field: 'type' | 'currency') {
    return fees.reduce<Record<string, number>>((acc, fee) => {
      acc[fee[field]] = (acc[fee[field]] ?? 0) + fee.amount;
      return acc;
    }, {});
  }

  private sum(fees: FeeSample[]) {
    return fees.reduce((total, fee) => total + fee.amount, 0);
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
}
