import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generateCode(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? '';
    return this.referralService.generateCode(userId);
  }

  @Get('stats')
  getStats(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? '';
    return this.referralService.getStats(userId);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? '';
    return this.referralService.findByReferrer(userId);
  }

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  applyCode(
    @Req() req: AuthenticatedRequest,
    @Body() body: { code?: string },
  ) {
    const userId = req.user?.sub ?? '';
    return this.referralService.applyCode(body.code ?? '', userId);
  }

  // Qualifying and rewarding credit a real wallet balance, so they are
  // back-office operations rather than something a referrer may trigger.
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Post(':id/qualify')
  qualify(@Param('id') id: string) {
    return this.referralService.qualifyReferral(id);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Post(':id/reward')
  reward(@Param('id') id: string) {
    return this.referralService.rewardReferral(id);
  }
}
