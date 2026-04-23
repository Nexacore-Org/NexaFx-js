import { Controller, Get, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { RiskAnalyticsService } from '../services/risk-analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Risk - Analytics')
@Controller('risk')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RiskAnalyticsController {
  constructor(private readonly analytics: RiskAnalyticsService) {}

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get real-time risk dashboard' })
  @ApiResponse({ status: 200, description: 'Risk dashboard retrieved successfully' })
  async getDashboard(@Req() req: any) {
    const userId = req.user.id;
    return this.analytics.getPortfolioDashboard(userId);
  }

  @Get('stress-test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get projected stress test results' })
  @ApiResponse({ status: 200, description: 'Stress test results retrieved successfully' })
  async getStressTest(@Req() req: any) {
    const userId = req.user.id;
    return this.analytics.getStressTestResults(userId);
  }
}
