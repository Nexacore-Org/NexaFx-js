import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReconciliationAnalyticsService } from '../services/reconciliation-analytics.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@Controller('admin/analytics/reconciliation')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReconciliationAnalyticsController {
  constructor(private readonly analytics: ReconciliationAnalyticsService) {}

  @Get()
  async getSummary() {
    const summary = await this.analytics.getSummary();
    const timeSeries = await this.analytics.getDailyMismatchCounts();
    return { ...summary, timeSeries };
  }
}
