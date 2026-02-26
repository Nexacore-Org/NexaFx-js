import { Injectable } from '@nestjs/common';
import { RiskPosition } from '../entities/risk-position.entity';

@Injectable()
export class RiskCalculationService {
  calculateTotalExposure(positions: RiskPosition[]): number {
    return positions.reduce(
      (sum, pos) => sum + Number(pos.quantity) * Number(pos.currentPrice),
      0,
    );
  }

  calculateNetExposure(positions: RiskPosition[]): number {
    return positions.reduce((sum, pos) => {
      const value = Number(pos.quantity) * Number(pos.currentPrice);
      return sum + (pos.side === 'BUY' ? value : -value);
    }, 0);
  }

  calculateUsedMargin(positions: RiskPosition[]): number {
    return positions.reduce((sum, pos) => {
      return (
        sum +
        (Number(pos.quantity) * Number(pos.currentPrice)) / Number(pos.leverage)
      );
    }, 0);
  }

  calculateVaR(positions: RiskPosition[], confidenceLevel = 0.95): number {
    // Simplified parametric VaR calculation
    // Assuming 2% daily volatility for simplicity, normally this would come from market data
    const dailyVolatility = 0.02;
    const zScore = confidenceLevel === 0.99 ? 2.33 : 1.645;

    // Calculate portfolio variance (simplified: assumes correlation of 1 for worst case, or sum of individual VaRs)
    // A better approach is using covariance matrix, but for this demo, we sum individual VaRs conservatively
    const totalVaR = positions.reduce((sum, pos) => {
      const positionValue = Number(pos.quantity) * Number(pos.currentPrice);
      return sum + positionValue * dailyVolatility * zScore;
    }, 0);

    return totalVaR;
  }

  calculateDrawdown(peakEquity: number, currentEquity: number): number {
    if (peakEquity <= 0) return 0;
    return Math.max(0, (peakEquity - currentEquity) / peakEquity);
  }

  calculateRiskScore(metrics: {
    exposure: number;
    equity: number;
    var: number;
    drawdown: number;
  }): number {
    // 0-100 score where 100 is high risk
    let score = 0;

    // Leverage component
    const leverage = metrics.exposure / (metrics.equity || 1);
    score += Math.min(leverage * 10, 40); // Max 40 points for leverage > 4x

    // VaR component
    const varRatio = metrics.var / (metrics.equity || 1);
    score += Math.min(varRatio * 100, 30); // Max 30 points for VaR > 30% of equity

    // Drawdown component
    score += Math.min(metrics.drawdown * 100, 30); // Max 30 points for drawdown > 30%

    return Math.min(Math.round(score), 100);
  }
}
