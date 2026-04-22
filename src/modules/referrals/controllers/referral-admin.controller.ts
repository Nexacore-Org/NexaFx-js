import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ReferralService } from '../services/referral.service';
import { ReferralFraudService } from '../services/referral-fraud.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/referrals')
export class ReferralAdminController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly fraudService: ReferralFraudService,
  ) {}

  /** GET /admin/referrals/suspicious — flagged referrals with fraud signals */
  @Get('suspicious')
  getSuspicious() {
    return this.fraudService.getSuspiciousReferrals();
  }

  /** PATCH /admin/referrals/:id/approve-reward — disburse reward for flagged referral */
  @Patch(':id/approve-reward')
  approveReward(@Param('id') id: string) {
    return this.referralService.approveReward(id);
  }
}
