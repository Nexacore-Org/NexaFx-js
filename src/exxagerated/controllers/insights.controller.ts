import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { InsightsService } from '../services/insights.service';
import { AuthGuard } from '../../auth/auth.guard';

@Controller('insights')
@UseGuards(AuthGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('spending')
  async getSpending(@Req() req: any) {
    const userId = req.user.id;

    return this.insightsService.getSpendingInsights(userId);
  }

  @Get('categories')
  async getCategories(@Req() req: any) {
    const userId = req.user.id;

    return this.insightsService.getCategoryBreakdown(userId);
  }

  @Get('trends')
  async getTrends(@Req() req: any) {
    const userId = req.user.id;

    return this.insightsService.getSpendingTrends(userId);
  }
}