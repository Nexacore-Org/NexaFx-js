import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ReferralService } from '../services/referral.service';

class UpdateReferralConfigDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  rewardAmount?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxReferrals?: number;

  @IsOptional()
  @IsBoolean()
  programActive?: boolean;
}

@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * POST /referrals/generate
   * Generate a unique referral code for the authenticated user.
   */
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(@Req() req: any) {
    const userId: string = req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');

    const referral = await this.referralService.generateCode(userId);
    return { code: referral.code, status: referral.status, createdAt: referral.createdAt };
  }

  /**
   * GET /referrals/stats
   * Get referral statistics for the authenticated user.
   */
  @Get('stats')
  async stats(@Req() req: any) {
    const userId: string = req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');

    return this.referralService.getStats(userId);
  }

  /**
   * GET /referrals/config
   * Get current program configuration (admin).
   */
  @Get('config')
  getConfig() {
    return this.referralService.getProgramConfig();
  }

  /**
   * PATCH /referrals/config
   * Update program configuration (admin): reward amount, max referrals, active state.
   */
  @Patch('config')
  async updateConfig(@Body() dto: UpdateReferralConfigDto) {
    return this.referralService.updateProgramConfig(dto);
  }

  /**
   * GET /referrals/leaderboard
   * Top 10 referrers by conversion count for the current month.
   */
  @Get('leaderboard')
  async leaderboard() {
    return this.referralService.getLeaderboard();
  }
}
