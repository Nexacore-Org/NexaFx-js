// src/modules/fx/fx-aggregator.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class FxAggregatorService {
  async getValidatedRate(pair: string): Promise<number> {
    const rates = await Promise.all([
      this.fetchFromProviderA(pair),
      this.fetchFromProviderB(pair),
      this.fetchFromProviderC(pair),
    ]);

    const validRates = rates.filter(r => r > 0);
    return this.computeMedian(validRates);
  }

  private computeMedian(values: number[]): number {
    if (values.length === 0) throw new Error('No valid rates available');
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    return values.length % 2 ? values[half] : (values[half - 1] + values[half]) / 2;
  }
}