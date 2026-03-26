import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class FxRatesService {
  private readonly rates = new Map<string, number>();

  constructor() {
    this.rates.set(this.buildKey('USD', 'NGN'), 1600);
    this.rates.set(this.buildKey('EUR', 'USD'), 1.08);
    this.rates.set(this.buildKey('GBP', 'USD'), 1.27);
  }

  setRate(
    baseCurrency: string,
    quoteCurrency: string,
    rate: number,
  ): { previousRate?: number; currentRate: number } {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException('Rate must be greater than zero.');
    }

    const key = this.buildKey(baseCurrency, quoteCurrency);
    const previousRate = this.rates.get(key);
    this.rates.set(key, rate);
    return {
      previousRate,
      currentRate: rate,
    };
  }

  getRate(baseCurrency: string, quoteCurrency: string): number {
    const direct = this.rates.get(this.buildKey(baseCurrency, quoteCurrency));
    if (direct) {
      return direct;
    }

    const inverse = this.rates.get(this.buildKey(quoteCurrency, baseCurrency));
    if (inverse) {
      return Number((1 / inverse).toFixed(6));
    }

    throw new BadRequestException(
      `No FX rate configured for ${baseCurrency}/${quoteCurrency}.`,
    );
  }

  private buildKey(baseCurrency: string, quoteCurrency: string): string {
    return `${baseCurrency.toUpperCase()}:${quoteCurrency.toUpperCase()}`;
  }
}
