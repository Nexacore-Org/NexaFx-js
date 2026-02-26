import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceMetric } from '../entities/performance-metric.entity';
import { Strategy } from '../entities/strategy.entity';

export interface Trade {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  timestamp: Date;
  isLong: boolean;
}

@Injectable()
export class MetricsCollectorService {
  constructor(
    @InjectRepository(PerformanceMetric)
    private readonly metricRepo: Repository<PerformanceMetric>,
  ) {}

  async calculateAndStoreMetrics(
    strategy: Strategy,
    trades: Trade[],
    regime: string,
  ): Promise<PerformanceMetric | null> {
    if (trades.length === 0) {
      return null;
    }

    const returns = trades.map((trade) => {
      const pnl = trade.isLong
        ? (trade.exitPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - trade.exitPrice) * trade.quantity;
      return pnl / (trade.entryPrice * trade.quantity);
    });

    const roi = returns.reduce((a, b) => a + b, 0);
    const winRate = returns.filter((r) => r > 0).length / returns.length;

    // Sharpe Ratio (Assuming risk-free rate of 0 for simplicity)
    const avgReturn = roi / returns.length;
    const stdDev = this.calculateStandardDeviation(returns);
    const sharpeRatio = stdDev === 0 ? 0 : avgReturn / stdDev;

    // Max Drawdown
    let peak = -Infinity;
    let maxDrawdown = 0;
    let runningPnl = 0;

    for (const ret of returns) {
      runningPnl += ret;
      if (runningPnl > peak) {
        peak = runningPnl;
      }
      const drawdown = peak - runningPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    const metric = this.metricRepo.create({
      strategy,
      roi,
      sharpeRatio,
      maxDrawdown,
      volatility: stdDev,
      winRate,
      regime,
      timestamp: new Date(),
    });

    return this.metricRepo.save(metric);
  }

  private calculateStandardDeviation(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance =
      data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }
}
