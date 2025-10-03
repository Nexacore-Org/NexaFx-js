import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RateProviderService {
  private readonly logger = new Logger(RateProviderService.name);

  constructor(private readonly http: HttpService) {}

  async fetchBestRate(base: string, quote: string): Promise<number> {
    // Placeholder: query multiple providers and pick best
    // Integrate Fixer.io, CurrencyLayer, OpenExchangeRates
    try {
      // Example stub response with minor pseudo-variation to simulate rates
      const seed = (base + quote).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const variation = ((seed % 5) - 2) * 0.001; // -0.002 .. 0.002
      const baseline = base === quote ? 1 : 1 + variation;
      return Number(baseline.toFixed(6));
    } catch (e) {
      this.logger.error(`Rate fetch failed: ${e.message}`);
      throw e;
    }
  }
}


