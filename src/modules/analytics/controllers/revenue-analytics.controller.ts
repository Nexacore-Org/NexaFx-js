import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RevenueAnalyticsService } from '../services/revenue-analytics.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AnalyticsPeriod } from '../services/transaction-analytics.service';

@Controller('admin/analytics/revenue')
@UseGuards(RolesGuard)
export class RevenueAnalyticsController {
  constructor(private readonly analytics: RevenueAnalyticsService) {}

  @Get()
  @Roles('admin')
  async getRevenue(
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analytics.getRevenueSummary({
      period: this.getPeriod(period),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  private getPeriod(value?: string): AnalyticsPeriod {
    return value === 'WEEKLY' || value === 'MONTHLY' ? value : 'DAILY';
  }
}
