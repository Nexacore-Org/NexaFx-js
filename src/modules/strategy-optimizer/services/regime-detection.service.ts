import { Injectable } from '@nestjs/common';

export enum MarketRegime {
  LOW_VOLATILITY = 'low_volatility',
  HIGH_VOLATILITY = 'high_volatility',
  TRENDING_UP = 'trending_up',
  TRENDING_DOWN = 'trending_down',
  CHOOPY = 'choppy',
}

@Injectable()
export class RegimeDetectionService {
  detectRegime(prices: number[]): MarketRegime {
    if (prices.length < 20) {
      return MarketRegime.LOW_VOLATILITY; // Default fallback
    }

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const volatility = this.calculateStandardDeviation(returns);
    const trend = (prices[prices.length - 1] - prices[0]) / prices[0];

    // Simple heuristic thresholds
    if (volatility > 0.02) {
      return MarketRegime.HIGH_VOLATILITY;
    } else if (trend > 0.05) {
      return MarketRegime.TRENDING_UP;
    } else if (trend < -0.05) {
      return MarketRegime.TRENDING_DOWN;
    } else {
      return MarketRegime.LOW_VOLATILITY;
    }
  }

  private calculateStandardDeviation(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance =
      data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }
}
