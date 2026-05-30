import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface RateResult {
  base: string;
  target: string;
  rate: number;
  provider: string;
  fetchedAt: Date;
  ageMs: number;
}

interface CacheEntry {
  rate: number;
  provider: string;
  fetchedAt: Date;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.ttlMs = 60_000;
  }

  async getRate(base: string, target: string): Promise<RateResult> {
    const key = `${base.toUpperCase()}:${target.toUpperCase()}`;
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.fetchedAt.getTime() < this.ttlMs) {
      return {
        base,
        target,
        rate: cached.rate,
        provider: cached.provider,
        fetchedAt: cached.fetchedAt,
        ageMs: Date.now() - cached.fetchedAt.getTime(),
      };
    }

    const result = await this.fetchWithFallback(base, target);
    this.cache.set(key, result);

    return {
      base,
      target,
      rate: result.rate,
      provider: result.provider,
      fetchedAt: result.fetchedAt,
      ageMs: 0,
    };
  }

  private async fetchWithFallback(
    base: string,
    target: string,
  ): Promise<CacheEntry> {
    try {
      return await this.fetchFromOpenExchangeRates(base, target);
    } catch (err) {
      this.logger.warn(
        `OpenExchangeRates failed, falling back: ${(err as Error).message}`,
      );
    }

    try {
      return await this.fetchFromExchangeRateHost(base, target);
    } catch (err) {
      this.logger.error(
        `ExchangeRateHost fallback also failed: ${(err as Error).message}`,
      );
    }

    throw new ServiceUnavailableException(
      'Exchange rate providers are currently unavailable',
    );
  }

  private async fetchFromOpenExchangeRates(
    base: string,
    target: string,
  ): Promise<CacheEntry> {
    const apiKey = this.config.get<string>('fx.openExchangeRatesApiKey');
    const url = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&base=${base}&symbols=${target}`;
    const res = await firstValueFrom(this.http.get<{ rates: Record<string, number> }>(url));
    const rate = res.data.rates[target.toUpperCase()];
    if (!rate) throw new Error(`Rate not found for ${target}`);
    return { rate, provider: 'openexchangerates', fetchedAt: new Date() };
  }

  private async fetchFromExchangeRateHost(
    base: string,
    target: string,
  ): Promise<CacheEntry> {
    const apiKey = this.config.get<string>('fx.exchangeRateHostApiKey');
    const url = `https://api.exchangerate.host/live?access_key=${apiKey}&source=${base}&currencies=${target}`;
    const res = await firstValueFrom(this.http.get<{ quotes: Record<string, number> }>(url));
    const rateKey = `${base.toUpperCase()}${target.toUpperCase()}`;
    const rate = res.data.quotes?.[rateKey];
    if (!rate) throw new Error(`Rate not found for ${target}`);
    return { rate, provider: 'exchangeratehost', fetchedAt: new Date() };
  }
}
