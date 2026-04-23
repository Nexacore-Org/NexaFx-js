import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../../modules/auth/guards/admin.guard';
import {
  ApiUsageService,
  ApiUsageSummary,
} from '../services/api-usage.service';

@Controller('admin/api-usage')
@UseGuards(AdminGuard)
export class AnalyticsAdminController {
  constructor(private readonly apiUsageService: ApiUsageService) {}

  @Get('summary')
  async getSummary(@Query('hoursBack') hoursBack?: string): Promise<{
    success: boolean;
    data: ApiUsageSummary & { highErrorRateEndpoints: any[] };
  }> {
    const hours = hoursBack ? parseInt(hoursBack, 10) : 24;
    const [data, highErrorRateEndpoints] = await Promise.all([
      this.apiUsageService.getSummary(hours),
      this.apiUsageService.getHighErrorRateEndpoints(),
    ]);

    return {
      success: true,
      data: { ...data, highErrorRateEndpoints },
    };
  }

  @Get('abuse')
  async getAbuse(@Query('threshold') threshold?: string): Promise<{
    success: boolean;
    data: { userId: string; requestCount: number; flaggedAt: string }[];
  }> {
    const requestThreshold = threshold ? parseInt(threshold, 10) : 1000;
    const data = await this.apiUsageService.getAbuse(requestThreshold);
    return { success: true, data };
  }

  @Get('raw')
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
}
