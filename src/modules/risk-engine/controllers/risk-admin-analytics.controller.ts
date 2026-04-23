import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { RiskAnalyticsService } from '../services/risk-analytics.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin - Risk Analytics')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RiskAdminAnalyticsController {
  constructor(private readonly analytics: RiskAnalyticsService) {}

  /**
   * GET /admin/analytics/risk
   * Returns top 10 highest-risk users by riskScore
   */
  @Get('analytics/risk')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get top 10 highest-risk users' })
  @ApiResponse({ status: 200, description: 'Top risk users retrieved successfully' })
  async getTopRiskUsers() {
    return this.analytics.getTopRiskUsers(10);
  }

  /**
   * POST /admin/risk/stress-test/:userId
   * Triggers on-demand stress test for a user
   */
  @Post('risk/stress-test/:userId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger on-demand stress test for a user' })
  @ApiResponse({ status: 200, description: 'Stress test completed successfully' })
  async triggerManualStressTest(@Param('userId') userId: string) {
    return this.analytics.triggerOnDemandStressTest(userId);
  }
}
