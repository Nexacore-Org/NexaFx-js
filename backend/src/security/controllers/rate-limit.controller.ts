import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { RateLimitService } from '../services/rate-limit.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { AdminGuard } from '../../backup/guards/admin.guard';
import {
  RATE_LIMIT_TIERS,
  ENDPOINT_RATE_LIMITS,
} from '../constants/rate-limit.constants';
import { ConfigureRateLimitDto } from '../dto/block-ip.dto';

@Controller('security')
export class RateLimitController {
  constructor(private readonly rateLimitService: RateLimitService) {}

  @Get('rate-limits')
  getRateLimits() {
    return {
      success: true,
      tiers: RATE_LIMIT_TIERS,
      endpoints: ENDPOINT_RATE_LIMITS,
    };
  }

  @Get('rate-limits/:userId/status')
  @UseGuards(RateLimitGuard)
  async getRateLimitStatus(@Param('userId') userId: string) {
    const remaining = await this.rateLimitService.getRemainingPoints(userId);
    return {
      success: true,
      userId,
      remaining,
      reset: Math.ceil(Date.now() / 1000) + 60, // reset time (1 minute)
    };
  }

  @Post('admin/rate-limits/configure')
  @UseGuards(AdminGuard)
  async configureRateLimits(@Body() dto: ConfigureRateLimitDto) {
    await this.rateLimitService.configureTier(dto.tier, dto.windowMs, dto.max);

    return {
      success: true,
      message: `Rate limit configuration updated for tier ${dto.tier}`,
      config: {
        tier: dto.tier,
        windowMs: dto.windowMs,
        max: dto.max,
      },
    };
  }
}
