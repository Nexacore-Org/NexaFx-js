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
}
