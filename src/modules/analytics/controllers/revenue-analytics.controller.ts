import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RevenueAnalyticsService } from '../services/revenue-analytics.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('admin/analytics/revenue')
@UseGuards(RolesGuard)
export class RevenueAnalyticsController {
  constructor(private readonly analytics: RevenueAnalyticsService) {}

  @Get()
  @Roles('admin')
  async getRevenue(@Query('period') period: 'DAILY' | 'WEEKLY' | 'MONTHLY') {
    return this.analytics.getRevenueSummary(period);
  }
}
