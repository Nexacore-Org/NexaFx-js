import { Injectable, Logger } from '@nestjs/common';
import { Strategy } from '../entities/strategy.entity';
import { StrategyParameter } from '../entities/strategy-parameter.entity';

interface OptimizationResult {
  parameters: Record<string, number>;
  score: number;
}

@Injectable()
export class OptimizationService {
  private readonly logger = new Logger(OptimizationService.name);

  async optimize(
    strategy: Strategy,
    historicalData: any[],
  ): Promise<OptimizationResult> {
    this.logger.log(`Starting optimization for strategy: ${strategy.name}`);

    // Generate parameter combinations
    const combinations = this.generateCombinations(strategy.parameters);
    this.logger.log(`Generated ${combinations.length} parameter combinations.`);

    let bestResult: OptimizationResult = { parameters: {}, score: -Infinity };

    // Rolling window simulation (simplified)
    // In a real scenario, we would split data into training and validation sets
    const trainData = historicalData.slice(
      0,
      Math.floor(historicalData.length * 0.7),
    );
    const validateData = historicalData.slice(
      Math.floor(historicalData.length * 0.7),
    );

    for (const params of combinations) {
      const score = await this.simulate(strategy, params, trainData);

      if (score > bestResult.score) {
        // Validate on out-of-sample data to prevent overfitting
        const validationScore = await this.simulate(
          strategy,
          params,
          validateData,
        );

        // Simple guardrail: Validation score shouldn't be drastically lower than training score
        if (validationScore > score * 0.8) {
          bestResult = { parameters: params, score: validationScore };
        }
      }
    }

    return bestResult;
  }

  private generateCombinations(
    params: StrategyParameter[],
  ): Record<string, number>[] {
    if (params.length === 0) return [{}];

    const firstParam = params[0];
    const restParams = params.slice(1);
    const restCombinations = this.generateCombinations(restParams);

    const combinations: Record<string, number>[] = [];

    for (
      let val = firstParam.min;
      val <= firstParam.max;
      val += firstParam.step
    ) {
      for (const combination of restCombinations) {
        combinations.push({
          [firstParam.key]: parseFloat(val.toFixed(4)),
          ...combination,
        });
      }
    }

    return combinations;
  }

  // Mock simulation function
  // In reality, this would run the strategy logic against historical data
  private async simulate(
    strategy: Strategy,
    params: Record<string, number>,
    data: any[],
  ): Promise<number> {
    // Mock score calculation based on random factor + parameter coherence
    // This is just a placeholder to demonstrate the flow
    return Math.random() * 100;
  }
}
