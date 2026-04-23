import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SpendingInsightsService } from '../services/spending-insights.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly service: SpendingInsightsService) {}

  @Get('spending')
  async getSpending(
    @Req() req: any,
    @Query('period') period: 'MONTHLY' | 'WEEKLY' = 'MONTHLY',
  ) {
    return this.service.getSpendingInsights(req.user?.id ?? req.user?.sub, period);
  }

  @Get('cashflow')
  async getCashflow(@Query('walletId') walletId: string) {
    // Delegated to ForecastController — kept here for routing compatibility
    return { walletId, message: 'Use /insights/cashflow?walletId=<id>' };
  }
}
