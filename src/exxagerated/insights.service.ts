import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  AggregatedTransactionMetrics,
  AggregatedUserMetrics,
  AggregatedRevenueMetrics,
  AggregationPeriodEnum,
} from '../entities/aggregated-metrics.entity';
import {
  GetInsightsQueryDto,
  TimeRangeEnum,
  InsightsSummaryResponseDto,
  TransactionMetricsDto,
  UserMetricsDto,
  RevenueMetricsDto,
  TimeSeriesDataPoint,
} from '../dto/insights.dto';
import { AnonymizationService } from './anonymization.service';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    @InjectRepository(AggregatedTransactionMetrics)
    private readonly transactionMetricsRepo: Repository<AggregatedTransactionMetrics>,
    @InjectRepository(AggregatedUserMetrics)
    private readonly userMetricsRepo: Repository<AggregatedUserMetrics>,
    @InjectRepository(AggregatedRevenueMetrics)
    private readonly revenueMetricsRepo: Repository<AggregatedRevenueMetrics>,
    private readonly anonymizationService: AnonymizationService,
  ) {}

  /**
   * Get comprehensive insights summary
   */
  async getInsightsSummary(
    query: GetInsightsQueryDto,
  ): Promise<InsightsSummaryResponseDto> {
    const { startDate, endDate, label } = this.calculateTimeRange(
      query.timeRange,
      query.startDate,
      query.endDate,
    );

    this.logger.log(
      `Fetching insights for range: ${startDate} to ${endDate} (${label})`,
    );

    // Fetch all metrics in parallel
    const [transactionMetrics, userMetrics, revenueMetrics] = await Promise.all([
      this.getTransactionMetrics(startDate, endDate),
      this.getUserMetrics(startDate, endDate),
      this.getRevenueMetrics(startDate, endDate),
    ]);

    // Fetch time series data
    const [transactionTimeSeries, userTimeSeries] = await Promise.all([
      this.getTransactionTimeSeries(startDate, endDate),
      this.getUserTimeSeries(startDate, endDate),
    ]);

    // Get last aggregation timestamp
    const lastAggregated = await this.getLastAggregationTime();

    // Build response with privacy safeguards
    const summary: InsightsSummaryResponseDto = {
      timeRange: {
        start: startDate,
        end: endDate,
        label,
      },
      transactions: transactionMetrics,
      users: userMetrics,
      revenue: revenueMetrics,
      transactionTimeSeries,
      userTimeSeries,
      lastAggregatedAt: lastAggregated,
      privacyNotice:
        'All data is aggregated and anonymized. No personal information is included.',
    };

    // Final privacy check
    const piiFields = this.anonymizationService.detectPotentialPII(summary);
    if (piiFields.length > 0) {
      this.logger.error(`PII detected in summary: ${piiFields.join(', ')}`);
      throw new Error('Cannot generate summary: PII detected');
    }

    return summary;
  }

  /**
   * Get transaction metrics with period-over-period comparison
   */
  private async getTransactionMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<TransactionMetricsDto> {
    // Current period metrics
    const currentMetrics = await this.transactionMetricsRepo
      .createQueryBuilder('metrics')
      .select('SUM(metrics.totalCount)', 'totalCount')
      .addSelect('SUM(metrics.totalVolume)', 'totalVolume')
      .addSelect('AVG(metrics.averageValue)', 'averageValue')
      .addSelect('SUM(metrics.successfulCount)', 'successfulCount')
      .addSelect('SUM(metrics.failedCount)', 'failedCount')
      .addSelect('AVG(metrics.successRate)', 'successRate')
      .where('metrics.periodStart >= :startDate', { startDate })
      .andWhere('metrics.periodEnd <= :endDate', { endDate })
      .getRawOne();

    // Previous period for comparison
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodDuration);
    const previousEnd = new Date(startDate);

    const previousMetrics = await this.transactionMetricsRepo
      .createQueryBuilder('metrics')
      .select('SUM(metrics.totalCount)', 'totalCount')
      .where('metrics.periodStart >= :previousStart', { previousStart })
      .andWhere('metrics.periodEnd <= :previousEnd', { previousEnd })
      .getRawOne();

    const periodOverPeriodChange = this.calculatePercentageChange(
      parseInt(currentMetrics.totalCount || '0', 10),
      parseInt(previousMetrics.totalCount || '0', 10),
    );

    return {
      totalCount: parseInt(currentMetrics.totalCount || '0', 10),
      totalVolume: parseFloat(currentMetrics.totalVolume || '0'),
      averageValue: parseFloat(currentMetrics.averageValue || '0'),
      successfulCount: parseInt(currentMetrics.successfulCount || '0', 10),
      failedCount: parseInt(currentMetrics.failedCount || '0', 10),
      successRate: parseFloat(currentMetrics.successRate || '0'),
      periodOverPeriodChange: this.anonymizationService.applyNumericalNoise(
        periodOverPeriodChange,
      ),
    };
  }

  /**
   * Get user metrics with period-over-period comparison
   */
  private async getUserMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<UserMetricsDto> {
    const currentMetrics = await this.userMetricsRepo
      .createQueryBuilder('metrics')
      .select('SUM(metrics.activeUsersCount)', 'activeUsers')
      .addSelect('SUM(metrics.newUsersCount)', 'newUsers')
      .addSelect('SUM(metrics.returningUsersCount)', 'returningUsers')
      .addSelect('AVG(metrics.averageSessionDuration)', 'averageSessionDuration')
      .addSelect('AVG(metrics.retentionRate)', 'retentionRate')
      .where('metrics.periodStart >= :startDate', { startDate })
      .andWhere('metrics.periodEnd <= :endDate', { endDate })
      .getRawOne();

    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodDuration);
    const previousEnd = new Date(startDate);

    const previousMetrics = await this.userMetricsRepo
      .createQueryBuilder('metrics')
      .select('SUM(metrics.activeUsersCount)', 'activeUsers')
      .where('metrics.periodStart >= :previousStart', { previousStart })
      .andWhere('metrics.periodEnd <= :previousEnd', { previousEnd })
      .getRawOne();

    const periodOverPeriodChange = this.calculatePercentageChange(
      parseInt(currentMetrics.activeUsers || '0', 10),
      parseInt(previousMetrics.activeUsers || '0', 10),
    );

    return {
      activeUsers: parseInt(currentMetrics.activeUsers || '0', 10),
      newUsers: parseInt(currentMetrics.newUsers || '0', 10),
      returningUsers: parseInt(currentMetrics.returningUsers || '0', 10),
      averageSessionDuration: parseInt(
        currentMetrics.averageSessionDuration || '0',
        10,
      ),
      retentionRate: parseFloat(currentMetrics.retentionRate || '0'),
      periodOverPeriodChange: this.anonymizationService.applyNumericalNoise(
        periodOverPeriodChange,
      ),
    };
  }

  /**
   * Get revenue metrics with period-over-period comparison
   */
  private async getRevenueMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<RevenueMetricsDto> {
    const currentMetrics = await this.revenueMetricsRepo
      .createQueryBuilder('metrics')
      .select('SUM(metrics.totalRevenue)', 'totalRevenue')
      .addSelect('AVG(metrics.averageRevenuePerUser)', 'averageRevenuePerUser')
      .addSelect('SUM(metrics.totalFees)', 'totalFees')
      .where('metrics.periodStart >= :startDate', { startDate })
      .andWhere('metrics.periodEnd <= :endDate', { endDate })
      .getRawOne();

    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodDuration);
    const previousEnd = new Date(startDate);

    const previousMetrics = await this.revenueMetricsRepo
      .createQueryBuilder('metrics')
      .select('SUM(metrics.totalRevenue)', 'totalRevenue')
      .where('metrics.periodStart >= :previousStart', { previousStart })
      .andWhere('metrics.periodEnd <= :previousEnd', { previousEnd })
      .getRawOne();

    const periodOverPeriodChange = this.calculatePercentageChange(
      parseFloat(currentMetrics.totalRevenue || '0'),
      parseFloat(previousMetrics.totalRevenue || '0'),
    );

    return {
      totalRevenue: parseFloat(currentMetrics.totalRevenue || '0'),
      averageRevenuePerUser: parseFloat(
        currentMetrics.averageRevenuePerUser || '0',
      ),
      totalFees: parseFloat(currentMetrics.totalFees || '0'),
      periodOverPeriodChange: this.anonymizationService.applyNumericalNoise(
        periodOverPeriodChange,
      ),
    };
  }

  /**
   * Get transaction volume time series
   */
  private async getTransactionTimeSeries(
    startDate: Date,
    endDate: Date,
  ): Promise<TimeSeriesDataPoint[]> {
    const metrics = await this.transactionMetricsRepo.find({
      where: {
        periodStart: MoreThanOrEqual(startDate),
        periodEnd: LessThanOrEqual(endDate),
        periodType: AggregationPeriodEnum.DAILY,
      },
      order: { periodStart: 'ASC' },
    });

    return metrics.map((metric) => ({
      timestamp: metric.periodStart,
      value: parseFloat(metric.totalVolume.toString()),
    }));
  }

  /**
   * Get active users time series
   */
  private async getUserTimeSeries(
    startDate: Date,
    endDate: Date,
  ): Promise<TimeSeriesDataPoint[]> {
    const metrics = await this.userMetricsRepo.find({
      where: {
        periodStart: MoreThanOrEqual(startDate),
        periodEnd: LessThanOrEqual(endDate),
        periodType: AggregationPeriodEnum.DAILY,
      },
      order: { periodStart: 'ASC' },
    });

    return metrics.map((metric) => ({
      timestamp: metric.periodStart,
      value: parseInt(metric.activeUsersCount.toString(), 10),
    }));
  }

  /**
   * Calculate time range from query parameters
   */
  private calculateTimeRange(
    timeRange: TimeRangeEnum,
    customStart?: string,
    customEnd?: string,
  ): { startDate: Date; endDate: Date; label: string } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;
    let label: string;

    switch (timeRange) {
      case TimeRangeEnum.LAST_24_HOURS:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        label = 'Last 24 Hours';
        break;

      case TimeRangeEnum.LAST_7_DAYS:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        label = 'Last 7 Days';
        break;

      case TimeRangeEnum.LAST_30_DAYS:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        label = 'Last 30 Days';
        break;

      case TimeRangeEnum.LAST_90_DAYS:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        label = 'Last 90 Days';
        break;

      case TimeRangeEnum.CUSTOM:
        if (!customStart || !customEnd) {
          throw new Error('Custom date range requires startDate and endDate');
        }
        startDate = new Date(customStart);
        endDate = new Date(customEnd);
        label = 'Custom Range';
        break;

      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        label = 'Last 7 Days';
    }

    return { startDate, endDate, label };
  }

  /**
   * Calculate percentage change between two values
   */
  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  }

  /**
   * Get the last aggregation timestamp
   */
  private async getLastAggregationTime(): Promise<Date> {
    const latestTransaction = await this.transactionMetricsRepo.findOne({
      order: { createdAt: 'DESC' },
    });

    return latestTransaction?.createdAt || new Date();
  }

  /**
   * Get privacy compliance metadata
   */
  getPrivacyMetadata() {
    return this.anonymizationService.generatePrivacyMetadata();
  }
}