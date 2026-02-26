import { Injectable } from '@nestjs/common';
import { RiskPosition } from '../entities/risk-position.entity';
import { RiskCalculationService } from './risk-calculation.service';

export interface StressScenario {
  name: string;
  priceShock: number; // e.g., -0.10 for 10% drop
  volatilityShock: number; // e.g., 1.5 for 50% increase
  liquidityShock?: number; // e.g., 0.05 spread widening
}

@Injectable()
export class StressTestService {
  constructor(private readonly riskCalc: RiskCalculationService) {}

  async simulateScenario(
    positions: RiskPosition[],
    scenario: StressScenario,
    currentEquity: number,
  ): Promise<{
    projectedPnL: number;
    projectedEquity: number;
    projectedMargin: number;
    isLiquidated: boolean;
  }> {
    let projectedPnL = 0;
    let projectedMargin = 0;

    for (const pos of positions) {
      // Simulate price impact
      // ... (logic remains similar but refined)
      const shock = scenario.priceShock || 0;
      const volShock = scenario.volatilityShock || 1;

      const shockedPrice = Number(pos.currentPrice) * (1 + shock);
      const positionValue = Number(pos.quantity) * shockedPrice;
      const entryValue = Number(pos.quantity) * Number(pos.entryPrice);

      const pnl =
        pos.side === 'BUY'
          ? positionValue - entryValue
          : entryValue - positionValue;

      projectedPnL += pnl;

      // Calculate margin requirement with volatility shock
      // Margin = PositionValue / Leverage. If Vol increases, margin req might increase (simulated by reducing effective leverage)
      // For simplicity: Margin = (Value / Leverage) * VolShock
      const marginReq = (positionValue / pos.leverage) * volShock;
      projectedMargin += marginReq;
    }

    const finalEquity = currentEquity + projectedPnL;
    const isLiquidated = finalEquity <= projectedMargin * 0.5; // Liquidation if equity drops below 50% margin

    return {
      projectedPnL,
      projectedEquity: finalEquity,
      projectedMargin,
      isLiquidated,
    };
  }

  async runStandardScenarios(
    positions: RiskPosition[],
    currentEquity: number,
  ): Promise<Record<string, any>> {
    const scenarios: StressScenario[] = [
      { name: 'Flash Crash -10%', priceShock: -0.1, volatilityShock: 1.5 },
      { name: 'Market Rally +10%', priceShock: 0.1, volatilityShock: 1.2 },
      { name: 'Black Swan -30%', priceShock: -0.3, volatilityShock: 3.0 },
      { name: 'Vol Spike Only', priceShock: 0, volatilityShock: 2.0 },
    ];

    const results = {};
    for (const scenario of scenarios) {
      const res = await this.simulateScenario(
        positions,
        scenario,
        currentEquity,
      );
      results[scenario.name] = {
        ...res,
        marginUtilization: res.projectedMargin / (res.projectedEquity || 1), // Avoid div by zero
      };
    }
    return results;
  }
}
