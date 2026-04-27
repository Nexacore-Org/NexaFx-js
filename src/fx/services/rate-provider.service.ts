import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosError } from 'axios';

/**
 * Interface for exchange rate providers
 * Matches the interface expected by the forward contract module
 */
export interface ExchangeRateProvider {
  getMidRate(fromCurrency: string, toCurrency: string): Promise<number>;
}

export interface RateProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  enabled: boolean;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  lastSuccessAt?: number;
  latencyHistory: number[];
  consecutiveFailures: number;
}

@Injectable()
export class RateProviderService implements ExchangeRateProvider {
  private readonly logger = new Logger(RateProviderService.name);
  private readonly CACHE_TTL = 30; // seconds
  private readonly STALE_CACHE_TTL = 5 * 60; // 5 minutes
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30 * 1000; // 30 seconds
  private readonly MAX_LATENCY_HISTORY = 10;

  private readonly providers: Map<string, RateProviderConfig> = new Map();
  private readonly circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Open Exchange Rates
    const oerApiKey = this.configService.get<string>('OPEN_EXCHANGE_RATES_API_KEY');
    if (oerApiKey) {
      this.providers.set('openexchangerates', {
        name: 'Open Exchange Rates',
        baseUrl: 'https://openexchangerates.org/api/latest.json',
        apiKey: oerApiKey,
        timeout: 1000,
        enabled: true,
      });
    }

    // Frankfurter API (free, no API key required)
    this.providers.set('frankfurter', {
      name: 'Frankfurter',
      baseUrl: 'https://api.frankfurter.app/latest',
      timeout: 1000,
      enabled: true,
    });

    // ExchangeRate.host
    const exchangeRateHostKey = this.configService.get<string>('EXCHANGE_RATE_HOST_API_KEY');
    if (exchangeRateHostKey) {
      this.providers.set('exchangeratehost', {
        name: 'ExchangeRate.host',
        baseUrl: 'https://api.exchangerate.host/latest',
        apiKey: exchangeRateHostKey,
        timeout: 1000,
        enabled: true,
      });
    }

    this.logger.log(`Initialized ${this.providers.size} rate providers`);
  }

  /**
   * Get mid-market rate with caching and failover
   * Implements the ExchangeRateProvider interface for forward contract compatibility
   */
  async getMidRate(fromCurrency: string, toCurrency: string): Promise<number> {
    this.validateCurrencyPair(fromCurrency, toCurrency);

    const cacheKey = `fx:rate:${fromCurrency}_${toCurrency}`;
    const staleKey = `fx:rate:stale:${fromCurrency}_${toCurrency}`;

    // Try primary cache first
    const cachedRate = await this.redis.get(cacheKey);
    if (cachedRate) {
      return parseFloat(cachedRate);
    }

    // Try stale cache as fallback
    const staleRate = await this.redis.get(staleKey);
    if (staleRate) {
      this.logger.warn(`Using stale rate for ${fromCurrency}/${toCurrency}: ${staleRate}`);
      return parseFloat(staleRate);
    }

    // Fetch from providers with failover
    const rate = await this.fetchWithFailover(fromCurrency, toCurrency);
    
    if (rate === null) {
      // All providers failed, try to return last known rate from stale cache
      const lastKnownRate = await this.redis.get(staleKey);
      if (lastKnownRate) {
        throw new ServiceUnavailableException({
          message: 'All rate providers failed',
          lastKnownRate: parseFloat(lastKnownRate),
          rateIsStale: true,
          rateStaleSince: await this.redis.get(`${staleKey}:timestamp`),
        });
      }

      throw new ServiceUnavailableException('All rate providers failed and no cached rates available');
    }

    // Cache the rate
    await this.redis.setex(cacheKey, this.CACHE_TTL, rate.toString());
    await this.redis.setex(staleKey, this.STALE_CACHE_TTL, rate.toString());
    await this.redis.setex(`${staleKey}:timestamp`, this.STALE_CACHE_TTL, new Date().toISOString());

    return rate;
  }

  /**
   * Sequential failover logic
   */
  private async fetchWithFailover(fromCurrency: string, toCurrency: string): Promise<number | null> {
    const enabledProviders = Array.from(this.providers.entries())
      .filter(([_, config]) => config.enabled);

    for (const [name, config] of enabledProviders) {
      if (this.isCircuitBreakerOpen(name)) {
        this.logger.debug(`Circuit breaker open for provider ${name}, skipping`);
        continue;
      }

      const startTime = Date.now();
      try {
        const rate = await this.fetchFromProvider(name, config, fromCurrency, toCurrency);
        const latency = Date.now() - startTime;
        this.recordSuccess(name, latency);
        return rate;
      } catch (error) {
        this.recordFailure(name);
        this.logger.error(`Provider ${name} failed: ${error.message}`);
        // Continue to next provider
      }
    }

    return null;
  }

  /**
   * Fetch rate from a specific provider
   */
  private async fetchFromProvider(
    providerName: string,
    config: RateProviderConfig,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    const url = this.buildProviderUrl(config, fromCurrency, toCurrency);
    const headers = config.apiKey ? { apikey: config.apiKey } : {};

    const response = await firstValueFrom(
      this.httpService.get(url, { 
        headers,
        timeout: config.timeout,
      }).pipe(
        timeout(config.timeout),
        catchError((error: AxiosError) => {
          throw new Error(`HTTP ${error.response?.status || 'Network'}: ${error.message}`);
        })
      )
    );

    return this.parseProviderResponse(providerName, response.data, fromCurrency, toCurrency);
  }

  /**
   * Build provider-specific URL
   */
  private buildProviderUrl(config: RateProviderConfig, fromCurrency: string, toCurrency: string): string {
    switch (config.name) {
      case 'Open Exchange Rates':
        return `${config.baseUrl}?app_id=${config.apiKey}&base=${fromCurrency}&symbols=${toCurrency}`;
      
      case 'Frankfurter':
        return `${config.baseUrl}?from=${fromCurrency}&to=${toCurrency}`;
      
      case 'ExchangeRate.host':
        return `${config.baseUrl}?base=${fromCurrency}&symbols=${toCurrency}&access_key=${config.apiKey}`;
      
      default:
        throw new Error(`Unknown provider: ${config.name}`);
    }
  }

  /**
   * Parse provider-specific response format
   */
  private parseProviderResponse(providerName: string, data: any, fromCurrency: string, toCurrency: string): number {
    // Note: providerName here is the key from initializeProviders (e.g. 'openexchangerates')
    switch (providerName) {
      case 'openexchangerates':
      case 'frankfurter':
      case 'exchangeratehost':
        if (!data.rates || !data.rates[toCurrency]) {
          throw new Error(`Invalid response format: missing rate for ${toCurrency}`);
        }
        return data.rates[toCurrency];

      default:
        // Fallback for case variations
        if (data.rates && data.rates[toCurrency]) {
          return data.rates[toCurrency];
        }
        throw new Error(`Unknown provider format for: ${providerName}`);
    }
  }

  /**
   * Circuit breaker management
   */
  private isCircuitBreakerOpen(providerName: string): boolean {
    const state = this.circuitBreakers.get(providerName);
    if (!state) return false;

    const now = Date.now();
    
    if (state.isOpen && now >= state.nextAttemptTime) {
      // Half-open state
      state.isOpen = false;
      this.logger.debug(`Circuit breaker for ${providerName} entering half-open state`);
      return false;
    }

    return state.isOpen;
  }

  private recordSuccess(providerName: string, latency: number): void {
    let state = this.circuitBreakers.get(providerName);
    if (!state) {
      state = this.initBreakerState();
      this.circuitBreakers.set(providerName, state);
    }
    
    state.failureCount = 0;
    state.consecutiveFailures = 0;
    state.isOpen = false;
    state.lastSuccessAt = Date.now();
    
    state.latencyHistory.push(latency);
    if (state.latencyHistory.length > this.MAX_LATENCY_HISTORY) {
      state.latencyHistory.shift();
    }
  }

  private recordFailure(providerName: string): void {
    let state = this.circuitBreakers.get(providerName);
    if (!state) {
      state = this.initBreakerState();
      this.circuitBreakers.set(providerName, state);
    }

    state.failureCount++;
    state.consecutiveFailures++;
    state.lastFailureTime = Date.now();

    if (state.consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      state.isOpen = true;
      state.nextAttemptTime = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
      this.logger.warn(`Circuit breaker opened for provider ${providerName} after ${state.consecutiveFailures} consecutive failures`);
    }
  }

  private initBreakerState(): CircuitBreakerState {
    return {
      isOpen: false,
      failureCount: 0,
      consecutiveFailures: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
      latencyHistory: [],
    };
  }

  /**
   * Validate currency pair format
   */
  private validateCurrencyPair(fromCurrency: string, toCurrency: string): void {
    if (!fromCurrency || !toCurrency) {
      throw new Error('Currency codes cannot be empty');
    }

    if (fromCurrency.length !== 3 || toCurrency.length !== 3) {
      throw new Error('Currency codes must be 3 characters (ISO 4217)');
    }

    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      throw new Error('Source and target currencies must be different');
    }
  }

  /**
   * Get provider status for monitoring
   */
  async getProviderStatus(): Promise<any> {
    const status: any[] = [];
    
    for (const [name, config] of this.providers.entries()) {
      const breakerState = this.circuitBreakers.get(name);
      const avgLatency = breakerState?.latencyHistory.length 
        ? breakerState.latencyHistory.reduce((a, b) => a + b, 0) / breakerState.latencyHistory.length 
        : 0;

      status.push({
        provider: name,
        displayName: config.name,
        enabled: config.enabled,
        circuitBreakerState: breakerState?.isOpen ? 'OPEN' : 'CLOSED',
        consecutiveFailures: breakerState?.consecutiveFailures || 0,
        lastSuccessAt: breakerState?.lastSuccessAt ? new Date(breakerState.lastSuccessAt).toISOString() : null,
        lastFailureAt: breakerState?.lastFailureTime ? new Date(breakerState.lastFailureTime).toISOString() : null,
        avgLatencyMs: Math.round(avgLatency),
      });
    }

    return status;
  }

  /**
   * SLA Alerting check
   */
  async getProvidersWithHighFailures(threshold: number = 5): Promise<string[]> {
    const failing: string[] = [];
    for (const [name, state] of this.circuitBreakers.entries()) {
      if (state.consecutiveFailures >= threshold) {
        failing.push(name);
      }
    }
    return failing;
  }

  /**
   * Reset circuit breaker for a provider (admin function)
   */
  async resetCircuitBreaker(providerName: string): Promise<void> {
    const state = this.circuitBreakers.get(providerName);
    if (state) {
      state.isOpen = false;
      state.failureCount = 0;
      state.consecutiveFailures = 0;
      this.logger.log(`Circuit breaker reset for provider ${providerName}`);
    }
  }

  /**
   * Clear cache for a specific currency pair
   */
  async clearCache(fromCurrency: string, toCurrency: string): Promise<void> {
    const cacheKey = `fx:rate:${fromCurrency}_${toCurrency}`;
    const staleKey = `fx:rate:stale:${fromCurrency}_${toCurrency}`;
    
    await Promise.all([
      this.redis.del(cacheKey),
      this.redis.del(staleKey),
      this.redis.del(`${staleKey}:timestamp`),
    ]);
    
    this.logger.log(`Cache cleared for ${fromCurrency}/${toCurrency}`);
  }
}
