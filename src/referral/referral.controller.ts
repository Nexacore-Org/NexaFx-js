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
} from '@nestjs/common';
import { ReferralService } from './referral.service';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

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

  @Post(':id/qualify')
  qualify(@Param('id') id: string) {
    return this.referralService.qualifyReferral(id);
  }

  @Post(':id/reward')
  reward(@Param('id') id: string) {
    return this.referralService.rewardReferral(id);
  }
}
