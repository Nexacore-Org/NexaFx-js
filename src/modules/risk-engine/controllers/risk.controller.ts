import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { RiskManagerService } from '../services/risk-manager.service';
import { RiskGuardService } from '../services/risk-guard.service';
import { TradeRequestDto } from '../dto/risk-check.dto';

@Controller('risk')
export class RiskController {
  constructor(
    private readonly riskManager: RiskManagerService,
    private readonly riskGuard: RiskGuardService,
  ) {}

  @Get('state/:userId')
  async getRiskState(@Param('userId') userId: string) {
    return this.riskManager.getRiskState(userId);
  }

  @Post('refresh/:userId')
  async refreshRiskState(@Param('userId') userId: string) {
    return this.riskManager.updateRiskMetrics(userId);
  }

  @Post('stress-test/:userId')
  async runStressTest(@Param('userId') userId: string) {
    return this.riskManager.runStressTest(userId);
  }

  @Put('limits/:userId')
  async updateLimits(@Param('userId') userId: string, @Body() limits: any) {
    return this.riskManager.updateLimits(userId, limits);
  }

  @Post('check-trade')
  async checkTrade(@Body() trade: TradeRequestDto) {
    return this.riskGuard.checkTradeRisk(trade);
  }

  @Get('stress-test')
  async getMyStressResults(@Req() req: any) {
    const utilization = await this.riskService.calculateMarginUtilization(req.user.id);
    return { userId: req.user.id, currentUtilization: utilization, timestamp: new Date() };
  }

  @Post('admin/stress-test/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async triggerManualStressTest(@Param('userId') userId: string) {
    const utilization = await this.riskService.calculateMarginUtilization(userId);
    await this.riskService.evaluateRiskLevel(userId, utilization);
    return { success: true, observedUtilization: utilization };
  }
}
