import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  AggregatedTransactionMetrics,
  AggregatedUserMetrics,
  AggregatedRevenueMetrics,
  AggregationPeriodEnum,
} from '../entities/aggregated-metrics.entity';

/**
 * Data Retention Rules:
 * - Hourly aggregations: Retain for 7 days
 * - Daily aggregations: Retain for 90 days
 * - Weekly aggregations: Retain for 1 year
 * - Monthly aggregations: Retain for 3 years
 */
@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  private readonly RETENTION_POLICIES = {
    [AggregationPeriodEnum.HOURLY]: 7, // days
    [AggregationPeriodEnum.DAILY]: 90, // days
    [AggregationPeriodEnum.WEEKLY]: 365, // days
    [AggregationPeriodEnum.MONTHLY]: 1095, // days (3 years)
  };

  constructor(
    @InjectRepository(AggregatedTransactionMetrics)
    private readonly transactionMetricsRepo: Repository<AggregatedTransactionMetrics>,
    @InjectRepository(AggregatedUserMetrics)
    private readonly userMetricsRepo: Repository<AggregatedUserMetrics>,
    @InjectRepository(AggregatedRevenueMetrics)
    private readonly revenueMetricsRepo: Repository<AggregatedRevenueMetrics>,
  ) {}

  /**
   * Calculates expiration date based on period type
   */
  calculateExpirationDate(periodType: AggregationPeriodEnum): Date {
    const retentionDays = this.RETENTION_POLICIES[periodType];
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + retentionDays);
    return expirationDate;
  }

  /**
   * Sets expiration date on newly created aggregation
   */
  setExpirationDate<T extends { periodType: AggregationPeriodEnum; expiresAt?: Date }>(
    metrics: T,
  ): T {
    metrics.expiresAt = this.calculateExpirationDate(metrics.periodType);
    return metrics;
  }

  /**
   * Scheduled job to purge expired aggregated data
   * Runs daily at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeExpiredData(): Promise<void> {
    this.logger.log('Starting scheduled data retention purge');

    try {
      const now = new Date();

      // Purge expired transaction metrics
      const transactionResult = await this.transactionMetricsRepo.delete({
        expiresAt: LessThan(now),
      });

      // Purge expired user metrics
      const userResult = await this.userMetricsRepo.delete({
        expiresAt: LessThan(now),
      });

      // Purge expired revenue metrics
      const revenueResult = await this.revenueMetricsRepo.delete({
        expiresAt: LessThan(now),
      });

      this.logger.log(
        `Data retention purge completed: ` +
          `Transactions: ${transactionResult.affected || 0}, ` +
          `Users: ${userResult.affected || 0}, ` +
          `Revenue: ${revenueResult.affected || 0}`,
      );
    } catch (error) {
      this.logger.error('Failed to purge expired data', error);
      throw error;
    }
  }

  /**
   * Manually trigger data purge (for testing or manual cleanup)
   */
  async manualPurge(): Promise<{
    transactionsPurged: number;
    usersPurged: number;
    revenuePurged: number;
  }> {
    this.logger.log('Manual data retention purge triggered');

    const now = new Date();

    const transactionResult = await this.transactionMetricsRepo.delete({
      expiresAt: LessThan(now),
    });

    const userResult = await this.userMetricsRepo.delete({
      expiresAt: LessThan(now),
    });

    const revenueResult = await this.revenueMetricsRepo.delete({
      expiresAt: LessThan(now),
    });

    return {
      transactionsPurged: transactionResult.affected || 0,
      usersPurged: userResult.affected || 0,
      revenuePurged: revenueResult.affected || 0,
    };
  }

  /**
   * Get retention policy information
   */
  getRetentionPolicies(): Record<AggregationPeriodEnum, number> {
    return { ...this.RETENTION_POLICIES };
  }

  /**
   * Get count of records that will be purged
   */
  async getExpiringRecordsCount(): Promise<{
    transactions: number;
    users: number;
    revenue: number;
  }> {
    const now = new Date();

    const [transactions, users, revenue] = await Promise.all([
      this.transactionMetricsRepo.count({
        where: { expiresAt: LessThan(now) },
      }),
      this.userMetricsRepo.count({
        where: { expiresAt: LessThan(now) },
      }),
      this.revenueMetricsRepo.count({
        where: { expiresAt: LessThan(now) },
      }),
    ]);

    return { transactions, users, revenue };
  }

  /**
   * Update retention policy for a specific period type
   * (Admin function - use with caution)
   */
  updateRetentionPolicy(
    periodType: AggregationPeriodEnum,
    retentionDays: number,
  ): void {
    if (retentionDays < 1) {
      throw new Error('Retention days must be at least 1');
    }

    this.RETENTION_POLICIES[periodType] = retentionDays;
    this.logger.warn(
      `Retention policy updated for ${periodType}: ${retentionDays} days`,
    );
  }

  /**
   * Recalculate expiration dates for existing records
   * (Use when retention policy changes)
   */
  async recalculateExpirationDates(
    periodType: AggregationPeriodEnum,
  ): Promise<void> {
    this.logger.log(`Recalculating expiration dates for ${periodType}`);

    const retentionDays = this.RETENTION_POLICIES[periodType];
    const newExpirationDate = new Date();
    newExpirationDate.setDate(newExpirationDate.getDate() + retentionDays);

    await Promise.all([
      this.transactionMetricsRepo.update(
        { periodType },
        { expiresAt: newExpirationDate },
      ),
      this.userMetricsRepo.update(
        { periodType },
        { expiresAt: newExpirationDate },
      ),
      this.revenueMetricsRepo.update(
        { periodType },
        { expiresAt: newExpirationDate },
      ),
    ]);

    this.logger.log(
      `Expiration dates recalculated for ${periodType} to ${newExpirationDate}`,
    );
  }
}