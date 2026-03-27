import { Controller, Get, Patch, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { RiskScoringService } from '../services/risk-scoring.service';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(RolesGuard)
export class RiskAdminController {
  constructor(private readonly riskService: RiskScoringService) {}

  @Get('risk/queue')
  @Roles('compliance_officer', 'admin')
  async getQueue() {
    return this.riskService.getRiskQueue();
  }

  @Patch('transactions/:id/risk-override')
  @Roles('compliance_officer', 'admin')
  async override(
    @Param('id') id: string,
    @Body('newScore') newScore: number,
    @Body('reason') reason: string,
    @Req() req: any
  ) {
    return this.riskService.overrideRiskScore(id, newScore, reason, req.user.id);
  }

  @Post('risk/queue/:id/approve')
  @Roles('compliance_officer', 'admin')
  async approve(@Param('id') id: string, @Req() req: any) {
    return this.riskService.processDisposition(id, 'APPROVE', req.user.id);
  }

  @Post('risk/queue/:id/reject')
  @Roles('compliance_officer', 'admin')
  async reject(@Param('id') id: string, @Req() req: any) {
    return this.riskService.processDisposition(id, 'REJECT', req.user.id);
  }
}