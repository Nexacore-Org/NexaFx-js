import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TimeRangeEnum {
  LAST_24_HOURS = 'last_24_hours',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  CUSTOM = 'custom',
}

export enum MetricTypeEnum {
  TRANSACTIONS = 'transactions',
  USERS = 'users',
  REVENUE = 'revenue',
  ALL = 'all',
}

export class GetInsightsQueryDto {
  @ApiPropertyOptional({
    enum: TimeRangeEnum,
    default: TimeRangeEnum.LAST_7_DAYS,
  })
  @IsOptional()
  @IsEnum(TimeRangeEnum)
  timeRange?: TimeRangeEnum = TimeRangeEnum.LAST_7_DAYS;

  @ApiPropertyOptional({
    description: 'Start date for custom range (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for custom range (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    enum: MetricTypeEnum,
    default: MetricTypeEnum.ALL,
  })
  @IsOptional()
  @IsEnum(MetricTypeEnum)
  metricType?: MetricTypeEnum = MetricTypeEnum.ALL;
}

export class TransactionMetricsDto {
  @ApiProperty({ description: 'Total number of transactions' })
  totalCount: number;

  @ApiProperty({ description: 'Total transaction volume' })
  totalVolume: number;

  @ApiProperty({ description: 'Average transaction value' })
  averageValue: number;

  @ApiProperty({ description: 'Number of successful transactions' })
  successfulCount: number;

  @ApiProperty({ description: 'Number of failed transactions' })
  failedCount: number;

  @ApiProperty({ description: 'Success rate percentage' })
  successRate: number;

  @ApiProperty({ description: 'Comparison with previous period (%)' })
  periodOverPeriodChange: number;
}

export class UserMetricsDto {
  @ApiProperty({ description: 'Total active users in period' })
  activeUsers: number;

  @ApiProperty({ description: 'New users in period' })
  newUsers: number;

  @ApiProperty({ description: 'Returning users in period' })
  returningUsers: number;

  @ApiProperty({ description: 'Average session duration (seconds)' })
  averageSessionDuration: number;

  @ApiProperty({ description: 'User retention rate (%)' })
  retentionRate: number;

  @ApiProperty({ description: 'Comparison with previous period (%)' })
  periodOverPeriodChange: number;
}

export class RevenueMetricsDto {
  @ApiProperty({ description: 'Total revenue in period' })
  totalRevenue: number;

  @ApiProperty({ description: 'Average revenue per user' })
  averageRevenuePerUser: number;

  @ApiProperty({ description: 'Total fees collected' })
  totalFees: number;

  @ApiProperty({ description: 'Comparison with previous period (%)' })
  periodOverPeriodChange: number;
}

export class TimeSeriesDataPoint {
  @ApiProperty({ description: 'Timestamp of data point' })
  timestamp: Date;

  @ApiProperty({ description: 'Value at this point' })
  value: number;
}

export class InsightsSummaryResponseDto {
  @ApiProperty({ description: 'Time range of the insights' })
  timeRange: {
    start: Date;
    end: Date;
    label: string;
  };

  @ApiProperty({ type: TransactionMetricsDto })
  transactions: TransactionMetricsDto;

  @ApiProperty({ type: UserMetricsDto })
  users: UserMetricsDto;

  @ApiProperty({ type: RevenueMetricsDto })
  revenue: RevenueMetricsDto;

  @ApiProperty({
    type: [TimeSeriesDataPoint],
    description: 'Transaction volume over time',
  })
  transactionTimeSeries: TimeSeriesDataPoint[];

  @ApiProperty({
    type: [TimeSeriesDataPoint],
    description: 'Active users over time',
  })
  userTimeSeries: TimeSeriesDataPoint[];

  @ApiProperty({ description: 'When this data was last aggregated' })
  lastAggregatedAt: Date;

  @ApiProperty({ description: 'Privacy notice' })
  privacyNotice: string;
}