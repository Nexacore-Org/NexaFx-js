import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AggregationService } from '../services/aggregation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AnalyticsAdminController {
  constructor(
    private readonly aggregationService: AggregationService,
  ) {}

  /**
   * POST /admin/analytics/aggregate
   * Manually trigger aggregation job
   */
  @Post('aggregate')
  async triggerAggregation(@Req() req: any) {
    const adminId = req.user?.id;

    const result =
      await this.aggregationService.runManualAggregation(adminId);

    return {
      success: true,
      message: 'Aggregation triggered successfully',
      data: result,
    };
  }

  /**
   * GET /admin/analytics/lineage
   * Returns aggregation history / audit trail
   */
  @Get('lineage')
  async getLineage() {
    const lineage =
      await this.aggregationService.getAggregationLineage();

    return {
      success: true,
      data: lineage,
    };
  }
}