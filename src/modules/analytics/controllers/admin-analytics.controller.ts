import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import {
  ApiUsageService,
  ApiUsageSummary,
} from '../services/api-usage.service';
import {
  AnalyticsPeriod,
  TransactionAnalyticsService,
} from '../services/transaction-analytics.service';
import { FraudAnalyticsService } from '../services/fraud-analytics.service';

@Controller()
@UseGuards(AdminGuard)
export class AnalyticsAdminController {
  constructor(
    private readonly apiUsageService: ApiUsageService,
    private readonly transactionAnalytics: TransactionAnalyticsService,
    private readonly fraudAnalytics: FraudAnalyticsService,
  ) {}

  @Get('admin/api-usage/summary')
  async getSummary(@Query('hoursBack') hoursBack?: string): Promise<{
    success: boolean;
    data: ApiUsageSummary;
  }> {
    const hours = hoursBack ? parseInt(hoursBack, 10) : 24;
    const data = await this.apiUsageService.getSummary(hours);

    return {
      success: true,
      data,
    };
  }

  @Get('admin/api-usage/raw')
  async getRawLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('route') route?: string,
    @Query('method') method?: string,
    @Query('statusCode') statusCode?: string,
    @Query('hoursBack') hoursBack?: string,
  ) {
    const result = await this.apiUsageService.getRawLogs({
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
      route,
      method,
      statusCode: statusCode ? parseInt(statusCode, 10) : undefined,
      hoursBack: hoursBack ? parseInt(hoursBack, 10) : 24,
    });

    return {
      success: true,
      data: result.items,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }

  @Get('admin/analytics/transactions')
  getTransactionAnalytics(@Query() query: Record<string, string>) {
    return this.transactionAnalytics.getAnalytics({
      userId: query.userId ?? null,
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  @Get('admin/analytics/transactions/categories')
  getTransactionCategories(@Query() query: Record<string, string>) {
    return this.transactionAnalytics.getCategoryBreakdown({
      userId: query.userId ?? null,
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  @Get('admin/analytics/transactions/currencies')
  getTransactionCurrencies(@Query() query: Record<string, string>) {
    return this.transactionAnalytics.getCurrencyBreakdown({
      userId: query.userId ?? null,
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  @Get('admin/analytics/fraud')
  getFraudAnalytics(@Query() query: Record<string, string>) {
    return this.fraudAnalytics.getDashboard({
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  @Get('admin/analytics/fraud/heatmap')
  getFraudHeatmap(@Query() query: Record<string, string>) {
    return this.fraudAnalytics.getHeatmap({
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  private getPeriod(value?: string): AnalyticsPeriod {
    return value === 'WEEKLY' || value === 'MONTHLY' ? value : 'DAILY';
  }

  private getDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
  }
}
