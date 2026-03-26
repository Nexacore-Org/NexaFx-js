import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { FxAggregatorService, AggregatedRates } from './fx-aggregator.service';
import { CircuitBreakerService, CircuitState } from './circuit-breaker.service';
import { ProviderAService } from './providers/providerA.service';
import { ProviderBService } from './providers/providerB.service';
import { ProviderCService } from './providers/providerC.service';
import { FxRateResult } from './providers/providerA.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRate = (provider: string, rates: Record<string, number>): FxRateResult => ({
  provider,
  base: 'USD',
  rates,
  timestamp: Date.now(),
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, fallback?: any) => {
    const map: Record<string, any> = {
      FX_CACHE_TTL: 30,
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
      CIRCUIT_BREAKER_RECOVERY_TIMEOUT: 60000,
    };
    return map[key] ?? fallback;
  }),
};

const mockProviderA = { name: 'providerA', fetchRates: jest.fn() };
const mockProviderB = { name: 'providerB', fetchRates: jest.fn() };
const mockProviderC = { name: 'providerC', fetchRates: jest.fn() };

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('FxAggregatorService', () => {
  let service: FxAggregatorService;
  let circuitBreaker: CircuitBreakerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);
    mockCacheManager.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxAggregatorService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ProviderAService, useValue: mockProviderA },
        { provide: ProviderBService, useValue: mockProviderB },
        { provide: ProviderCService, useValue: mockProviderC },
        CircuitBreakerService,
      ],
    }).compile();

    service = module.get<FxAggregatorService>(FxAggregatorService);
    circuitBreaker = module.get<CircuitBreakerService>(CircuitBreakerService);

    // Reset all circuit breakers before each test
    ['providerA', 'providerB', 'providerC'].forEach((p) => circuitBreaker.reset(p));
  });

  // ─── Median logic ──────────────────────────────────────────────────────────

  describe('median()', () => {
    it('returns the middle value for an odd-length array', () => {
      expect(service.median([1, 3, 2])).toBe(2);
    });

    it('returns the average of the two middle values for an even-length array', () => {
      expect(service.median([1, 2, 3, 4])).toBe(2.5);
    });

    it('handles a single value', () => {
      expect(service.median([42])).toBe(42);
    });

    it('handles two values', () => {
      expect(service.median([1.0, 1.2])).toBeCloseTo(1.1);
    });

    it('returns 0 for an empty array', () => {
      expect(service.median([])).toBe(0);
    });

    it('is not mutated by sorting (pure function)', () => {
      const original = [3, 1, 2];
      service.median(original);
      expect(original).toEqual([3, 1, 2]);
    });
  });

  // ─── computeMedianRates ────────────────────────────────────────────────────

  describe('computeMedianRates()', () => {
    it('computes median across three providers', () => {
      const results = [
        makeRate('A', { EUR: 0.90, GBP: 0.78 }),
        makeRate('B', { EUR: 0.92, GBP: 0.80 }),
        makeRate('C', { EUR: 0.94, GBP: 0.82 }),
      ];
      const aggregated = service.computeMedianRates('USD', results);
      expect(aggregated.rates.EUR).toBe(0.92);
      expect(aggregated.rates.GBP).toBe(0.80);
    });

    it('ignores missing currency from one provider', () => {
      const results = [
        makeRate('A', { EUR: 0.90, JPY: 150 }),
        makeRate('B', { EUR: 0.92 }), // no JPY
        makeRate('C', { EUR: 0.94, JPY: 152 }),
      ];
      const aggregated = service.computeMedianRates('USD', results);
      // JPY: median of [150, 152] = 151
      expect(aggregated.rates.JPY).toBe(151);
    });

    it('filters out zero and NaN rates', () => {
      const results = [
        makeRate('A', { EUR: 0.90 }),
        makeRate('B', { EUR: 0 }),
        makeRate('C', { EUR: NaN }),
      ];
      const aggregated = service.computeMedianRates('USD', results);
      // Only 0.90 is valid → median is 0.90
      expect(aggregated.rates.EUR).toBe(0.90);
    });

    it('includes all providers in the providers field', () => {
      const results = [
        makeRate('providerA', { EUR: 0.90 }),
        makeRate('providerB', { EUR: 0.91 }),
      ];
      const aggregated = service.computeMedianRates('USD', results);
      expect(aggregated.providers).toEqual(['providerA', 'providerB']);
    });
  });

  // ─── getRates — happy path ─────────────────────────────────────────────────

  describe('getRates()', () => {
    it('returns aggregated rates from all three providers', async () => {
      mockProviderA.fetchRates.mockResolvedValue(makeRate('providerA', { EUR: 0.90 }));
      mockProviderB.fetchRates.mockResolvedValue(makeRate('providerB', { EUR: 0.92 }));
      mockProviderC.fetchRates.mockResolvedValue(makeRate('providerC', { EUR: 0.94 }));

      const result = await service.getRates('USD');
      expect(result.success).toBe(true);
      expect(result.data?.rates.EUR).toBe(0.92);
      expect(result.data?.providers).toHaveLength(3);
    });

    it('returns from cache on second call', async () => {
      const cached: AggregatedRates = {
        base: 'USD', rates: { EUR: 0.91 }, providers: ['providerA'],
        cachedAt: Date.now(), fromCache: false,
      };
      mockCacheManager.get.mockResolvedValueOnce(cached);

      const result = await service.getRates('USD');
      expect(result.success).toBe(true);
      expect(result.data?.fromCache).toBe(true);
      expect(mockProviderA.fetchRates).not.toHaveBeenCalled();
    });

    it('succeeds with only two providers available', async () => {
      mockProviderA.fetchRates.mockResolvedValue(makeRate('providerA', { EUR: 0.90 }));
      mockProviderB.fetchRates.mockRejectedValue(new Error('timeout'));
      mockProviderC.fetchRates.mockResolvedValue(makeRate('providerC', { EUR: 0.94 }));

      const result = await service.getRates('USD');
      expect(result.success).toBe(true);
      expect(result.data?.providers).toHaveLength(2);
    });

    it('caches successful rates in Redis', async () => {
      mockProviderA.fetchRates.mockResolvedValue(makeRate('providerA', { EUR: 0.90 }));
      mockProviderB.fetchRates.mockResolvedValue(makeRate('providerB', { EUR: 0.92 }));
      mockProviderC.fetchRates.mockResolvedValue(makeRate('providerC', { EUR: 0.94 }));

      await service.getRates('USD');
      expect(mockCacheManager.set).toHaveBeenCalledTimes(2); // live + last-known
    });
  });

  // ─── Fallback to last-known cache ─────────────────────────────────────────

  describe('all providers failed — fallback', () => {
    it('returns last-known cache when all providers fail', async () => {
      mockProviderA.fetchRates.mockRejectedValue(new Error('network error'));
      mockProviderB.fetchRates.mockRejectedValue(new Error('network error'));
      mockProviderC.fetchRates.mockRejectedValue(new Error('network error'));

      const lastKnown: AggregatedRates = {
        base: 'USD', rates: { EUR: 0.88 }, providers: ['providerA'],
        cachedAt: Date.now() - 120_000, fromCache: false,
      };
      // First get() call is for live cache (null), second is for last-known
      mockCacheManager.get
        .mockResolvedValueOnce(null)     // live cache miss
        .mockResolvedValueOnce(lastKnown); // last-known hit

      const result = await service.getRates('USD');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.lastKnown?.rates.EUR).toBe(0.88);
      expect(result.lastKnown?.warning).toBeDefined();
    });

    it('returns service unavailable when no last-known exists', async () => {
      mockProviderA.fetchRates.mockRejectedValue(new Error('fail'));
      mockProviderB.fetchRates.mockRejectedValue(new Error('fail'));
      mockProviderC.fetchRates.mockRejectedValue(new Error('fail'));
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getRates('USD');
      expect(result.success).toBe(false);
      expect(result.lastKnown).toBeUndefined();
    });
  });

  // ─── Circuit breaker state transitions ────────────────────────────────────

  describe('CircuitBreakerService — state transitions', () => {
    it('starts in CLOSED state', () => {
      expect(circuitBreaker.getStatus('providerA').state).toBe(CircuitState.CLOSED);
    });

    it('increments failure count on each failure', () => {
      circuitBreaker.recordFailure('providerA');
      circuitBreaker.recordFailure('providerA');
      expect(circuitBreaker.getStatus('providerA').failureCount).toBe(2);
    });

    it('transitions to OPEN after threshold failures', () => {
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }
      expect(circuitBreaker.getStatus('providerA').state).toBe(CircuitState.OPEN);
    });

    it('isAvailable() returns false when OPEN', () => {
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }
      expect(circuitBreaker.isAvailable('providerA')).toBe(false);
    });

    it('transitions to HALF_OPEN after recovery timeout', () => {
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }
      // Manually set nextAttemptTime to the past
      const status = circuitBreaker.getStatus('providerA');
      (circuitBreaker as any).circuits.set('providerA', {
        ...status,
        nextAttemptTime: Date.now() - 1,
      });

      expect(circuitBreaker.isAvailable('providerA')).toBe(true);
      expect(circuitBreaker.getStatus('providerA').state).toBe(CircuitState.HALF_OPEN);
    });

    it('transitions back to CLOSED on success from HALF_OPEN', () => {
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }
      const status = circuitBreaker.getStatus('providerA');
      (circuitBreaker as any).circuits.set('providerA', {
        ...status,
        state: CircuitState.HALF_OPEN,
      });

      circuitBreaker.recordSuccess('providerA');
      expect(circuitBreaker.getStatus('providerA').state).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getStatus('providerA').failureCount).toBe(0);
    });

    it('transitions back to OPEN on failure from HALF_OPEN', () => {
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }
      const status = circuitBreaker.getStatus('providerA');
      (circuitBreaker as any).circuits.set('providerA', {
        ...status,
        state: CircuitState.HALF_OPEN,
      });

      circuitBreaker.recordFailure('providerA');
      expect(circuitBreaker.getStatus('providerA').state).toBe(CircuitState.OPEN);
    });

    it('resets cleanly', () => {
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }
      circuitBreaker.reset('providerA');
      expect(circuitBreaker.getStatus('providerA').state).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getStatus('providerA').failureCount).toBe(0);
    });

    it('circuits are independent per provider', () => {
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }
      expect(circuitBreaker.getStatus('providerA').state).toBe(CircuitState.OPEN);
      expect(circuitBreaker.getStatus('providerB').state).toBe(CircuitState.CLOSED);
    });

    it('fast-fails when circuit is OPEN (no HTTP call made)', async () => {
      // Open the circuit for providerA
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('providerA');
      }

      mockProviderB.fetchRates.mockResolvedValue(makeRate('providerB', { EUR: 0.92 }));
      mockProviderC.fetchRates.mockResolvedValue(makeRate('providerC', { EUR: 0.94 }));

      await service.getRates('USD');
      // providerA.fetchRates should NOT be called when circuit is OPEN
      expect(mockProviderA.fetchRates).not.toHaveBeenCalled();
    });
  });
});
