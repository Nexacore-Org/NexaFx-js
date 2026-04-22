import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt.guard';
import { LoyaltyService } from '../loyalty.service';

@ApiTags('admin/loyalty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/loyalty')
export class LoyaltyAdminController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('redemption-analytics')
  @ApiOperation({ summary: 'Most popular reward type, avg redemption size, total redeemed this month' })
  getRedemptionAnalytics() {
    return this.loyaltyService.getRedemptionAnalytics();
  }

  @Get('tier-stats')
  @ApiOperation({ summary: 'Distribution of users by loyalty tier' })
  getTierStats() {
    return this.loyaltyService.getTierStats();
  }

  @Get('program-config')
  @ApiOperation({ summary: 'Get current loyalty program configuration' })
  getProgramConfig() {
    return this.loyaltyService.getProgramConfig();
  }

  @Put('program-config')
  @ApiOperation({ summary: 'Update loyalty program configuration (takes effect immediately)' })
  updateProgramConfig(@Body() config: any) {
    return this.loyaltyService.updateProgramConfig(config);
  }
}
