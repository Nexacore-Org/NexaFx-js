import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../../../modules/auth/guards/admin.guard';
import { ErrorAnalyticsService } from '../services/error-analytics.service';

@ApiTags('Admin Analytics')
@ApiBearerAuth('access-token')
@Controller('admin/analytics')
@UseGuards(AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly errorAnalytics: ErrorAnalyticsService) {}

  @Get('errors')
  @ApiOperation({ summary: 'Get top error codes by frequency in last 24h' })
  @ApiResponse({ status: 200, description: 'Top error codes returned' })
  async getTopErrors() {
    const data = await this.errorAnalytics.getTopErrors();
    return { success: true, data };
  }
}
