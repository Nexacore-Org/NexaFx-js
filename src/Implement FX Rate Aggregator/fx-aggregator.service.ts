import {
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ProviderAService } from './providers/providerA.service';
import { ProviderBService } from './providers/providerB.service';
import { ProviderCService } from './providers/providerC.service';
import { FxRateResult } from './providers/providerA.service';

export interface AggregatedRates {
  base: string;
  rates: Record<string, number>;
  providers: string[];
  cachedAt: number;
  fromCache: boolean;
  warning?: string;
}

export interface FxRateResponse {
  success: boolean;
  data?: AggregatedRates;
  error?: string;
  lastKnown?: AggregatedRates;
}

@Injectable()
export class FxAggregatorService {
  private readonly logger = new Logger(FxAggregatorService.name);
  private readonly cacheTtl: number;
  private readonly LAST_KNOWN_KEY_PREFIX = 'fx:last_known:';
  private readonly RATES_KEY_PREFIX = 'fx:rates:';

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly providerA: ProviderAService,
    private readonly providerB: ProviderBService,
    private readonly providerC: ProviderCService,
  ) {
    this.cacheTtl = this.configService.get<number>('FX_CACHE_TTL', 30);
  }

  // ─── Public interface (preserves existing contract) ───────────────────────

  async getRates(base = 'USD'): Promise<FxRateResponse> {
    const normalizedBase = base.toUpperCase();
    const cacheKey = `${this.RATES_KEY_PREFIX}${normalizedBase}`;

    // 1. Check live cache first
    const cached = await this.cacheManager.get<AggregatedRates>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${normalizedBase}`);
      return { success: true, data: { ...cached, fromCache: true } };
    }

    // 2. Fetch from all providers concurrently
    const results = await Promise.allSettled([
      this.fetchFromProviderA(normalizedBase),
      this.fetchFromProviderB(normalizedBase),
      this.fetchFromProviderC(normalizedBase),
    ]);

    const successful = results
      .filter((r): r is PromiseFulfilledResult<FxRateResult> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (successful.length === 0) {
      return this.handleAllProvidersFailed(normalizedBase);
    }

    // 3. Compute median rates across successful providers
    const aggregated = this.computeMedianRates(normalizedBase, successful);

    // 4. Cache the fresh result
    await this.cacheManager.set(cacheKey, aggregated, this.cacheTtl * 1000);
    await this.cacheManager.set(
      `${this.LAST_KNOWN_KEY_PREFIX}${normalizedBase}`,
      aggregated,
      0, // No TTL — last-known persists until overwritten
    );

    return { success: true, data: aggregated };
  }

  // ─── Provider fetch methods (implementation of the three missing methods) ──

  async fetchFromProviderA(base: string): Promise<FxRateResult> {
    const provider = this.providerA.name;

    if (!this.circuitBreaker.isAvailable(provider)) {
      throw new Error(`Circuit breaker OPEN for ${provider}`);
    }

    try {
      const result = await this.providerA.fetchRates(base);
      this.circuitBreaker.recordSuccess(provider);
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure(provider);
      this.logger.warn(`Provider A failed: ${err.message}`);
      throw err;
    }
  }

  async fetchFromProviderB(base: string): Promise<FxRateResult> {
    const provider = this.providerB.name;

    if (!this.circuitBreaker.isAvailable(provider)) {
      throw new Error(`Circuit breaker OPEN for ${provider}`);
    }

    try {
      const result = await this.providerB.fetchRates(base);
      this.circuitBreaker.recordSuccess(provider);
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure(provider);
      this.logger.warn(`Provider B failed: ${err.message}`);
      throw err;
    }
  }

  async fetchFromProviderC(base: string): Promise<FxRateResult> {
    const provider = this.providerC.name;

    if (!this.circuitBreaker.isAvailable(provider)) {
      throw new Error(`Circuit breaker OPEN for ${provider}`);
    }

    try {
      const result = await this.providerC.fetchRates(base);
      this.circuitBreaker.recordSuccess(provider);
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure(provider);
      this.logger.warn(`Provider C failed: ${err.message}`);
      throw err;
    }
  }

  // ─── Median computation ────────────────────────────────────────────────────

  computeMedianRates(base: string, results: FxRateResult[]): AggregatedRates {
    // Gather all currency symbols across providers
    const allSymbols = new Set<string>();
    for (const r of results) {
      Object.keys(r.rates).forEach((s) => allSymbols.add(s));
    }

    const medianRates: Record<string, number> = {};

    for (const symbol of allSymbols) {
      const values = results
        .map((r) => r.rates[symbol])
        .filter((v) => v !== undefined && !isNaN(v) && v > 0);

      if (values.length > 0) {
        medianRates[symbol] = this.median(values);
      }
    }

    return {
      base,
      rates: medianRates,
      providers: results.map((r) => r.provider),
      cachedAt: Date.now(),
      fromCache: false,
    };
  }

  /** Pure median — handles both odd and even length arrays */
  median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  // ─── Fallback: last-known cache ────────────────────────────────────────────

  private async handleAllProvidersFailed(base: string): Promise<FxRateResponse> {
    this.logger.error(`All providers failed for base ${base}. Attempting last-known fallback.`);

    const lastKnown = await this.cacheManager.get<AggregatedRates>(
      `${this.LAST_KNOWN_KEY_PREFIX}${base}`,
    );

    if (lastKnown) {
      this.logger.warn(`Returning last-known rates for ${base} cached at ${new Date(lastKnown.cachedAt).toISOString()}`);
      return {
        success: false,
        error: 'All FX providers are currently unavailable.',
        lastKnown: {
          ...lastKnown,
          fromCache: true,
          warning: `Data from ${new Date(lastKnown.cachedAt).toISOString()} — providers unavailable`,
        },
      };
    }

    return {
      success: false,
      error: 'All FX providers are currently unavailable and no cached rates exist.',
    };
  }
}
