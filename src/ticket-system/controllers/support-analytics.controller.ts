import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from '../support.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('admin/support')
@ApiBearerAuth()
@Controller('admin/support/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'support')
export class SupportAnalyticsController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'Get support ticket analytics: avg first response time and SLA breach rates' })
  @ApiResponse({ status: 200, description: 'Returns analytics data' })
  async getAnalytics() {
    const data = await this.supportService.getAnalytics();
    return {
      success: true,
      data,
      generatedAt: new Date().toISOString(),
    };
  }
}
