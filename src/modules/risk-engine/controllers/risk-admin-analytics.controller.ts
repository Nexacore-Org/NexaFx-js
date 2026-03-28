import { Controller, Get, UseGuards } from '@nestjs/common';
import { RiskAnalyticsService } from '../services/risk-analytics.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('admin/analytics')
@UseGuards(RolesGuard)
export class RiskAdminAnalyticsController {
  constructor(private readonly analytics: RiskAnalyticsService) {}

  @Get('risk')
  @Roles('admin')
  async getTopRiskUsers() {
    return this.analytics.getTopRiskUsers();
  }
}
