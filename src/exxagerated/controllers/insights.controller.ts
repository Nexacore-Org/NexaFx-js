import {
  Controller,
  Get,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { InsightsService } from '../insights.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  /**
   * GET /insights/spending
   * Returns top spending categories + period-over-period delta
   */
  @Get('spending')
  async getSpendingInsights(
    @Req() req: any,
    @Query('period') period: string = '30d',
  ) {
    const userId = req.user?.id;

    const data = await this.insightsService.getSpendingInsights(
      userId,
      period,
    );

    return {
      success: true,
      data,
    };
  }

  /**
   * GET /insights/categories
   * Returns category breakdown
   */
  @Get('categories')
  async getCategoryBreakdown(@Req() req: any) {
    const userId = req.user?.id;

    const data = await this.insightsService.getCategoryBreakdown(
      userId,
    );

    return {
      success: true,
      data,
    };
  }

  /**
   * GET /insights/trends
   * Returns last 30 days transaction trends
   */
  @Get('trends')
  async getTrends(@Req() req: any) {
    const userId = req.user?.id;

    const data = await this.insightsService.getTransactionTrends(
      userId,
      30,
    );

    return {
      success: true,
      data,
    };
  }
}