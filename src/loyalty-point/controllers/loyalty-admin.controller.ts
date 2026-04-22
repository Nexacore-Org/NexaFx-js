import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt.guard';
import { AdminGuard } from '../../modules/auth/guards/admin.guard';
import { LoyaltyService } from '../loyalty.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/loyalty')
export class LoyaltyAdminController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  /**
   * GET /admin/loyalty/redemption-analytics
   * Most popular reward type, avg redemption size, total points redeemed this month.
   */
  @Get('redemption-analytics')
  getRedemptionAnalytics() {
    return this.loyaltyService.getRedemptionAnalytics();
  }
}
