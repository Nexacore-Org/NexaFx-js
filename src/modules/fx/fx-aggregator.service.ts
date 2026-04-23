import { Injectable } from '@nestjs/common';
import { CircuitBreaker } from '../../common/circuit-breaker/circuit-breaker.decorator';

@Injectable()
export class FxAggregatorService {
  circuitBreakerService: any; // injected by CircuitBreakerModule (global)

  async getValidatedRate(pair: string): Promise<number> {
    const rates = await Promise.all([
      this.fetchFromProviderA(pair),
      this.fetchFromProviderB(pair),
      this.fetchFromProviderC(pair),
    ]);

    const validRates = rates.filter((r) => r > 0);
    return this.computeMedian(validRates);
  }

  @CircuitBreaker('fx-provider-a')
  private async fetchFromProviderA(pair: string): Promise<number> {
    return this.simulateRate(pair, 0.9994);
  }

  @CircuitBreaker('fx-provider-b')
  private async fetchFromProviderB(pair: string): Promise<number> {
    return this.simulateRate(pair, 1.0002);
  }

  @CircuitBreaker('fx-provider-c')
  private async fetchFromProviderC(pair: string): Promise<number> {
    return this.simulateRate(pair, 1.0008);
  }

  private computeMedian(values: number[]): number {
    if (values.length === 0) throw new Error('No valid rates available');
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    return values.length % 2 ? values[half] : (values[half - 1] + values[half]) / 2;
  }

  private simulateRate(pair: string, multiplier: number): number {
    const normalizedPair = pair.toUpperCase();
    const baseRates: Record<string, number> = {
      'EUR/USD': 1.0865,
      'GBP/USD': 1.2741,
      'USD/JPY': 151.42,
      'USD/NGN': 1532.1,
      'BTC/USD': 67250,
    };
    const reference = baseRates[normalizedPair] ?? 1.125;
    return Number.parseFloat((reference * multiplier).toFixed(reference >= 100 ? 4 : 6));
  }
}
