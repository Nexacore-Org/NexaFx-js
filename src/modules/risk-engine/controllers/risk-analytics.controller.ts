import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RiskAnalyticsService } from '../services/risk-analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('risk')
@UseGuards(JwtAuthGuard)
export class RiskAnalyticsController {
  constructor(private readonly analytics: RiskAnalyticsService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const userId = req.user.id;
    return this.analytics.getPortfolioDashboard(userId);
  }

  @Get('stress-test')
  async getStressTest(@Req() req: any) {
    // Simulate standard scenarios (Flash Crash, Black Swan, etc.)
    // For demo, return static scenarios
    return [
      { scenario: 'Flash Crash', projectedPnL: -12000 },
      { scenario: 'Black Swan', projectedPnL: -50000 },
      { scenario: 'Volatility Spike', projectedPnL: -8000 },
    ];
  }
}
