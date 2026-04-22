import { Injectable, Logger } from '@nestjs/common';
import { Strategy } from '../entities/strategy.entity';
import { StrategyParameter } from '../entities/strategy-parameter.entity';
import { BacktestEngineService } from './backtest-engine.service';

interface OptimizationResult {
  parameters: Record<string, number>;
  score: number;
}

@Injectable()
export class OptimizationService {
  private readonly logger = new Logger(OptimizationService.name);

  constructor(private readonly backtestEngine: BacktestEngineService) {}

  async optimize(
    strategy: Strategy,
    historicalData: any[],
    trainRatio = 0.7,
  ): Promise<OptimizationResult> {
    this.logger.log(`Starting optimization for strategy: ${strategy.name}`);

    const prices: number[] = historicalData.map((d) =>
      typeof d === 'number' ? d : d.close ?? d.price ?? d,
    );

    const combinations = this.generateCombinations(strategy.parameters);
    this.logger.log(`Generated ${combinations.length} parameter combinations.`);

    let bestResult: OptimizationResult = { parameters: {}, score: -Infinity };

    for (const params of combinations) {
      const score = await this.simulate(strategy, params, prices, trainRatio);
      if (score > bestResult.score) {
        bestResult = { parameters: params, score };
      }
    }

    return bestResult;
  }

  private generateCombinations(params: StrategyParameter[]): Record<string, number>[] {
    if (params.length === 0) return [{}];
    const [first, ...rest] = params;
    const restCombinations = this.generateCombinations(rest);
    const combinations: Record<string, number>[] = [];
    for (let val = first.min; val <= first.max; val += first.step) {
      for (const combo of restCombinations) {
        combinations.push({ [first.key]: parseFloat(val.toFixed(4)), ...combo });
      }
    }
    return combinations;
  }

  /**
   * Real simulation using MA crossover strategy.
   * Fitness = Sharpe ratio on validation set (walk-forward, no look-ahead).
   * Rejects overfitted params where validation score < 80% of training score.
   */
  private async simulate(
    strategy: Strategy,
    params: Record<string, number>,
    prices: number[],
    trainRatio: number,
  ): Promise<number> {
    const shortPeriod = Math.round(params['shortPeriod'] ?? params['short_period'] ?? 5);
    const longPeriod = Math.round(params['longPeriod'] ?? params['long_period'] ?? 20);

    if (shortPeriod >= longPeriod || shortPeriod < 2 || longPeriod < 3) return -Infinity;

    const { train, validation } = this.backtestEngine.backtest(prices, shortPeriod, longPeriod, trainRatio);

    // Reject overfitted params
    if (isFinite(train.sharpeRatio) && validation.sharpeRatio < train.sharpeRatio * 0.8) {
      return -Infinity;
    }

    return isFinite(validation.sharpeRatio) ? validation.sharpeRatio : -Infinity;
  }
}
