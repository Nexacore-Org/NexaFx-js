import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import {
  AggregatedTransactionMetrics,
  AggregatedUserMetrics,
  AggregatedRevenueMetrics,
  AggregationPeriodEnum,
  AggregationJob,
} from '../entities/aggregated-metrics.entity';
import { DataRetentionService } from './data-retention.service';
import { AnonymizationService } from './anonymization.service';

/**
 * Service responsible for running aggregation jobs
 * NOTE: You'll need to replace the raw data queries with your actual
 * transaction/user/revenue tables
 */
@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    @InjectRepository(AggregatedTransactionMetrics)
    private readonly transactionMetricsRepo: Repository<AggregatedTransactionMetrics>,
    @InjectRepository(AggregatedUserMetrics)
    private readonly userMetricsRepo: Repository<AggregatedUserMetrics>,
    @InjectRepository(AggregatedRevenueMetrics)
    private readonly revenueMetricsRepo: Repository<AggregatedRevenueMetrics>,
    @InjectRepository(AggregationJob)
    private readonly aggregationJobRepo: Repository<AggregationJob>,
    private readonly dataSource: DataSource,
    private readonly dataRetentionService: DataRetentionService,
    private readonly anonymizationService: AnonymizationService,
  ) {}

  /**
   * Scheduled hourly aggregation job
   * Runs every hour at minute 5
   */
  @Cron('5 * * * *')
  async runHourlyAggregation(): Promise<void> {
    this.logger.log('Starting hourly aggregation job');
    await this.runAggregation(AggregationPeriodEnum.HOURLY);
  }

  /**
   * Scheduled daily aggregation job
   * Runs every day at 1 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDailyAggregation(): Promise<void> {
    this.logger.log('Starting daily aggregation job');
    await this.runAggregation(AggregationPeriodEnum.DAILY);
  }

  /**
   * Scheduled weekly aggregation job
   * Runs every Monday at 3 AM
   */
  @Cron(CronExpression.EVERY_WEEK)
  async runWeeklyAggregation(): Promise<void> {
    this.logger.log('Starting weekly aggregation job');
    await this.runAggregation(AggregationPeriodEnum.WEEKLY);
  }

  /**
   * Scheduled monthly aggregation job
   * Runs on the 1st of every month at 4 AM
   */
  @Cron('0 4 1 * *')
  async runMonthlyAggregation(): Promise<void> {
    this.logger.log('Starting monthly aggregation job');
    await this.runAggregation(AggregationPeriodEnum.MONTHLY);
  }

  /**
   * Main aggregation runner
   */
  async runAggregation(periodType: AggregationPeriodEnum): Promise<void> {
    const { periodStart, periodEnd } = this.calculatePeriodBounds(periodType);

    // Create aggregation job record
    const job = this.aggregationJobRepo.create({
      periodType,
      periodStart,
      periodEnd,
      status: 'pending',
    });
    await this.aggregationJobRepo.save(job);

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      await this.aggregationJobRepo.save(job);

      // Run aggregations in parallel
      await Promise.all([
        this.aggregateTransactionMetrics(periodType, periodStart, periodEnd),
        this.aggregateUserMetrics(periodType, periodStart, periodEnd),
        this.aggregateRevenueMetrics(periodType, periodStart, periodEnd),
      ]);

      job.status = 'completed';
      job.completedAt = new Date();
      await this.aggregationJobRepo.save(job);

      this.logger.log(
        `Aggregation job completed for ${periodType} (${periodStart} - ${periodEnd})`,
      );
    } catch (error) {
      job.status = 'failed';
      job.errorMessage = this.anonymizationService.sanitizeErrorMessage(
        error.message,
      );
      job.completedAt = new Date();
      await this.aggregationJobRepo.save(job);

      this.logger.error(
        `Aggregation job failed for ${periodType}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Aggregate transaction metrics
   * Replace the query with your actual transactions table
   */
  private async aggregateTransactionMetrics(
    periodType: AggregationPeriodEnum,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    // Example query - adjust to your actual schema
    const rawData = await this.dataSource.query(
      `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(AVG(amount), 0) as average_value,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM transactions
      WHERE created_at >= $1 AND created_at < $2
    `,
      [periodStart, periodEnd],
    );

    const data = rawData[0];

    // Validate anonymization threshold
    if (!this.anonymizationService.validateAggregationThreshold(data.total_count)) {
      this.logger.warn(
        `Transaction aggregation below threshold for ${periodType}`,
      );
      // Still save but flag it
    }

    const successRate =
      data.total_count > 0
        ? (data.successful_count / data.total_count) * 100
        : 0;

    const metrics = this.transactionMetricsRepo.create({
      periodType,
      periodStart,
      periodEnd,
      totalCount: parseInt(data.total_count, 10),
      totalVolume: parseFloat(data.total_volume),
      averageValue: parseFloat(data.average_value),
      successfulCount: parseInt(data.successful_count, 10),
      failedCount: parseInt(data.failed_count, 10),
      successRate: this.anonymizationService.applyNumericalNoise(successRate),
    });

    // Set expiration date based on retention policy
    this.dataRetentionService.setExpirationDate(metrics);

    await this.transactionMetricsRepo.save(metrics);
  }

  /**
   * Aggregate user metrics
   * Replace the query with your actual users/sessions table
   */
  private async aggregateUserMetrics(
    periodType: AggregationPeriodEnum,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    // Example query - adjust to your actual schema
    // This aggregates COUNT only, no user identifiers
    const rawData = await this.dataSource.query(
      `
      SELECT 
        COUNT(DISTINCT user_id) as active_users_count,
        COUNT(DISTINCT CASE WHEN created_at >= $1 AND created_at < $2 THEN user_id END) as new_users_count,
        COUNT(DISTINCT CASE WHEN created_at < $1 THEN user_id END) as returning_users_count,
        COALESCE(AVG(session_duration), 0) as avg_session_duration
      FROM user_sessions
      WHERE last_activity >= $1 AND last_activity < $2
    `,
      [periodStart, periodEnd],
    );

    const data = rawData[0];

    // Validate anonymization
    if (!this.anonymizationService.validateAggregationThreshold(data.active_users_count)) {
      this.logger.warn(`User aggregation below threshold for ${periodType}`);
    }

    const retentionRate =
      data.active_users_count > 0
        ? (data.returning_users_count / data.active_users_count) * 100
        : 0;

    const metrics = this.userMetricsRepo.create({
      periodType,
      periodStart,
      periodEnd,
      activeUsersCount: parseInt(data.active_users_count, 10),
      newUsersCount: parseInt(data.new_users_count, 10),
      returningUsersCount: parseInt(data.returning_users_count, 10),
      averageSessionDuration: parseInt(data.avg_session_duration, 10),
      retentionRate: this.anonymizationService.applyNumericalNoise(retentionRate),
    });

    this.dataRetentionService.setExpirationDate(metrics);
    await this.userMetricsRepo.save(metrics);
  }

  /**
   * Aggregate revenue metrics
   * Replace the query with your actual revenue/payments table
   */
  private async aggregateRevenueMetrics(
    periodType: AggregationPeriodEnum,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    // Example query - adjust to your actual schema
    const rawData = await this.dataSource.query(
      `
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COALESCE(SUM(fee_amount), 0) as total_fees,
        COUNT(DISTINCT user_id) as unique_users
      FROM payments
      WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'
    `,
      [periodStart, periodEnd],
    );

    const data = rawData[0];

    const averageRevenuePerUser =
      data.unique_users > 0 ? data.total_revenue / data.unique_users : 0;

    const metrics = this.revenueMetricsRepo.create({
      periodType,
      periodStart,
      periodEnd,
      totalRevenue: parseFloat(data.total_revenue),
      averageRevenuePerUser: this.anonymizationService.applyNumericalNoise(
        averageRevenuePerUser,
      ),
      totalFees: parseFloat(data.total_fees),
    });

    this.dataRetentionService.setExpirationDate(metrics);
    await this.revenueMetricsRepo.save(metrics);
  }

  /**
   * Calculate period bounds based on aggregation type
   */
  private calculatePeriodBounds(
    periodType: AggregationPeriodEnum,
  ): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    switch (periodType) {
      case AggregationPeriodEnum.HOURLY:
        // Previous complete hour
        periodEnd = new Date(now);
        periodEnd.setMinutes(0, 0, 0);
        periodStart = new Date(periodEnd);
        periodStart.setHours(periodStart.getHours() - 1);
        break;

      case AggregationPeriodEnum.DAILY:
        // Previous complete day
        periodEnd = new Date(now);
        periodEnd.setHours(0, 0, 0, 0);
        periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - 1);
        break;

      case AggregationPeriodEnum.WEEKLY:
        // Previous complete week (Monday to Sunday)
        periodEnd = new Date(now);
        periodEnd.setHours(0, 0, 0, 0);
        const dayOfWeek = periodEnd.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        periodEnd.setDate(periodEnd.getDate() - daysToMonday);
        periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - 7);
        break;

      case AggregationPeriodEnum.MONTHLY:
        // Previous complete month
        periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        periodStart = new Date(periodEnd);
        periodStart.setMonth(periodStart.getMonth() - 1);
        break;
    }

    return { periodStart, periodEnd };
  }

  /**
   * Manual trigger for aggregation (for testing or backfilling)
   */
  async manualAggregation(
    periodType: AggregationPeriodEnum,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    this.logger.log(
      `Manual aggregation triggered for ${periodType} (${periodStart} - ${periodEnd})`,
    );
    await this.runAggregation(periodType);
  }

  /**
   * Get aggregation job history
   */
  async getJobHistory(limit: number = 50): Promise<AggregationJob[]> {
    return this.aggregationJobRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}