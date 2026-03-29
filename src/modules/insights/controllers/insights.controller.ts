import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SpendingInsightsService } from "../services/spending-insights.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";

@Controller("insights")
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly service: SpendingInsightsService) {}

  @Get("spending")
  async getSpending(@Req() req) {
    const userId = req.user.id;
    const result = await this.service.getSpendingInsights(userId, "MONTHLY");
    return result;
  }
}
