import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AggregationService } from '../services/aggregation.service';
import { AdminGuard } from '../../auth/admin.guard';

@Controller('admin/analytics')
@UseGuards(AdminGuard)
export class AnalyticsAdminController {
  constructor(private readonly aggregationService: AggregationService) {}

  @Post('aggregate')
  async runAggregation() {
    const result = await this.aggregationService.runAggregation();

    return {
      status: 'success',
      run: result,
    };
  }

  @Get('lineage')
  async getLineage() {
    return this.aggregationService.getAggregationHistory();
  }
}