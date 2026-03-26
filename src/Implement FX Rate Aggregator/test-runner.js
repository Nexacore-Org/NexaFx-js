/**
 * NexaFx standalone test runner — no npm packages required.
 *
 * Implements the same logic as the TypeScript source files in plain JS,
 * then exercises every acceptance criterion with a minimal test harness.
 *
 * Run: node test-runner.js
 */

'use strict';

// ─── Tiny test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeCloseTo: (expected, precision = 5) => {
      const diff = Math.abs(actual - expected);
      if (diff > Math.pow(10, -precision)) throw new Error(`Expected ~${expected}, got ${actual}`);
    },
    toEqual: (expected) => {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toHaveLength: (len) => {
      if (actual.length !== len) throw new Error(`Expected length ${len}, got ${actual.length}`);
    },
    toBeDefined: () => {
      if (actual === undefined) throw new Error(`Expected defined, got undefined`);
    },
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
    },
    toContain: (item) => {
      if (!actual.includes(item)) throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
    },
    not: {
      toHaveBeenCalled: () => {
        if (actual._calls > 0) throw new Error(`Expected not to be called, but was called ${actual._calls} times`);
      },
      toBe: (expected) => {
        if (actual === expected) throw new Error(`Expected NOT ${JSON.stringify(expected)}`);
      },
    },
  };
}

function it(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.log(`  ✗ ${name}`);
        console.log(`    → ${err.message}`);
        failed++;
        failures.push({ name, err });
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
    failures.push({ name, err });
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  const results = fn();
  // collect promises
  return results;
}

// ─── Re-implement core logic (mirrors TypeScript sources) ────────────────────

// --- CircuitBreakerService ---

const CircuitState = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreakerService {
  constructor(failureThreshold = 5, recoveryTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.circuits = new Map();
  }

  _getOrCreate(provider) {
    if (!this.circuits.has(provider)) {
      this.circuits.set(provider, {
        state: CircuitState.CLOSED, failureCount: 0,
        lastFailureTime: null, nextAttemptTime: null,
      });
    }
    return this.circuits.get(provider);
  }

  isAvailable(provider) {
    const c = this._getOrCreate(provider);
    if (c.state === CircuitState.CLOSED) return true;
    if (c.state === CircuitState.OPEN) {
      if (c.nextAttemptTime && Date.now() >= c.nextAttemptTime) {
        c.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN
  }

  recordSuccess(provider) {
    const c = this._getOrCreate(provider);
    c.state = CircuitState.CLOSED;
    c.failureCount = 0;
    c.lastFailureTime = null;
    c.nextAttemptTime = null;
  }

  recordFailure(provider) {
    const c = this._getOrCreate(provider);
    c.failureCount += 1;
    c.lastFailureTime = Date.now();
    if (c.state === CircuitState.HALF_OPEN || c.failureCount >= this.failureThreshold) {
      c.state = CircuitState.OPEN;
      c.nextAttemptTime = Date.now() + this.recoveryTimeout;
    }
  }

  getStatus(provider) { return { ...this._getOrCreate(provider) }; }

  reset(provider) {
    this.circuits.set(provider, {
      state: CircuitState.CLOSED, failureCount: 0,
      lastFailureTime: null, nextAttemptTime: null,
    });
  }
}

// --- FxAggregatorService (pure logic, no HTTP/cache) ---

class FxAggregatorService {
  constructor(cacheManager, circuitBreaker, providerA, providerB, providerC, cacheTtl = 30) {
    this.cacheManager = cacheManager;
    this.circuitBreaker = circuitBreaker;
    this.providerA = providerA;
    this.providerB = providerB;
    this.providerC = providerC;
    this.cacheTtl = cacheTtl;
    this.RATES_KEY_PREFIX = 'fx:rates:';
    this.LAST_KNOWN_KEY_PREFIX = 'fx:last_known:';
  }

  median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
  }

  computeMedianRates(base, results) {
    const allSymbols = new Set();
    for (const r of results) Object.keys(r.rates).forEach(s => allSymbols.add(s));

    const medianRates = {};
    for (const symbol of allSymbols) {
      const values = results
        .map(r => r.rates[symbol])
        .filter(v => v !== undefined && !isNaN(v) && v > 0);
      if (values.length > 0) medianRates[symbol] = this.median(values);
    }

    return {
      base, rates: medianRates,
      providers: results.map(r => r.provider),
      cachedAt: Date.now(), fromCache: false,
    };
  }

  async fetchFromProvider(providerName, fetchFn, base) {
    if (!this.circuitBreaker.isAvailable(providerName)) {
      throw new Error(`Circuit breaker OPEN for ${providerName}`);
    }
    try {
      const result = await fetchFn(base);
      this.circuitBreaker.recordSuccess(providerName);
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure(providerName);
      throw err;
    }
  }

  async fetchFromProviderA(base) {
    return this.fetchFromProvider(this.providerA.name, (b) => this.providerA.fetchRates(b), base);
  }
  async fetchFromProviderB(base) {
    return this.fetchFromProvider(this.providerB.name, (b) => this.providerB.fetchRates(b), base);
  }
  async fetchFromProviderC(base) {
    return this.fetchFromProvider(this.providerC.name, (b) => this.providerC.fetchRates(b), base);
  }

  async getRates(base = 'USD') {
    const cacheKey = `${this.RATES_KEY_PREFIX}${base}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return { success: true, data: { ...cached, fromCache: true } };

    const results = await Promise.allSettled([
      this.fetchFromProviderA(base),
      this.fetchFromProviderB(base),
      this.fetchFromProviderC(base),
    ]);

    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    if (successful.length === 0) {
      const lastKnown = await this.cacheManager.get(`${this.LAST_KNOWN_KEY_PREFIX}${base}`);
      if (lastKnown) {
        return {
          success: false,
          error: 'All FX providers are currently unavailable.',
          lastKnown: { ...lastKnown, fromCache: true, warning: `Data from ${new Date(lastKnown.cachedAt).toISOString()}` },
        };
      }
      return { success: false, error: 'All FX providers are currently unavailable and no cached rates exist.' };
    }

    const aggregated = this.computeMedianRates(base, successful);
    await this.cacheManager.set(cacheKey, aggregated, this.cacheTtl * 1000);
    await this.cacheManager.set(`${this.LAST_KNOWN_KEY_PREFIX}${base}`, aggregated, 0);
    return { success: true, data: aggregated };
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeRate(provider, rates) {
  return { provider, base: 'USD', rates, timestamp: Date.now() };
}

function makeMockProvider(name, fetchImpl) {
  return { name, fetchRates: fetchImpl };
}

function makeCache(store = {}) {
  return {
    _store: { ...store },
    async get(key) { return this._store[key] ?? null; },
    async set(key, value) { this._store[key] = value; },
  };
}

// ─── Run all tests ────────────────────────────────────────────────────────────

async function runAll() {
  const promises = [];

  // ═══ CircuitBreakerService ════════════════════════════════════════════════

  describe('CircuitBreakerService — state transitions', () => {
    const cb = () => new CircuitBreakerService(5, 60000);

    it('starts in CLOSED state', () => {
      expect(cb().getStatus('p').state).toBe(CircuitState.CLOSED);
    });

    it('increments failure count per failure', () => {
      const c = cb();
      c.recordFailure('p'); c.recordFailure('p');
      expect(c.getStatus('p').failureCount).toBe(2);
    });

    it('stays CLOSED below threshold', () => {
      const c = cb();
      for (let i = 0; i < 4; i++) c.recordFailure('p');
      expect(c.getStatus('p').state).toBe(CircuitState.CLOSED);
    });

    it('transitions CLOSED → OPEN at threshold (5 failures)', () => {
      const c = cb();
      for (let i = 0; i < 5; i++) c.recordFailure('p');
      expect(c.getStatus('p').state).toBe(CircuitState.OPEN);
    });

    it('isAvailable() returns false when OPEN', () => {
      const c = cb();
      for (let i = 0; i < 5; i++) c.recordFailure('p');
      expect(c.isAvailable('p')).toBe(false);
    });

    it('transitions OPEN → HALF_OPEN after recovery timeout', () => {
      const c = cb();
      for (let i = 0; i < 5; i++) c.recordFailure('p');
      // simulate timeout elapsed
      c.circuits.get('p').nextAttemptTime = Date.now() - 1;
      expect(c.isAvailable('p')).toBe(true);
      expect(c.getStatus('p').state).toBe(CircuitState.HALF_OPEN);
    });

    it('transitions HALF_OPEN → CLOSED on success', () => {
      const c = cb();
      for (let i = 0; i < 5; i++) c.recordFailure('p');
      c.circuits.get('p').state = CircuitState.HALF_OPEN;
      c.recordSuccess('p');
      expect(c.getStatus('p').state).toBe(CircuitState.CLOSED);
      expect(c.getStatus('p').failureCount).toBe(0);
    });

    it('transitions HALF_OPEN → OPEN on failure', () => {
      const c = cb();
      for (let i = 0; i < 5; i++) c.recordFailure('p');
      c.circuits.get('p').state = CircuitState.HALF_OPEN;
      c.recordFailure('p');
      expect(c.getStatus('p').state).toBe(CircuitState.OPEN);
    });

    it('reset() restores CLOSED with zero failures', () => {
      const c = cb();
      for (let i = 0; i < 5; i++) c.recordFailure('p');
      c.reset('p');
      expect(c.getStatus('p').state).toBe(CircuitState.CLOSED);
      expect(c.getStatus('p').failureCount).toBe(0);
    });

    it('circuits are independent per provider', () => {
      const c = cb();
      for (let i = 0; i < 5; i++) c.recordFailure('providerA');
      expect(c.getStatus('providerA').state).toBe(CircuitState.OPEN);
      expect(c.getStatus('providerB').state).toBe(CircuitState.CLOSED);
    });

    it('sets nextAttemptTime when opening', () => {
      const c = cb();
      const before = Date.now();
      for (let i = 0; i < 5; i++) c.recordFailure('p');
      expect(c.getStatus('p').nextAttemptTime >= before + 60000).toBe(true);
    });
  });

  // ═══ median() ═════════════════════════════════════════════════════════════

  describe('FxAggregatorService — median()', () => {
    const svc = () => new FxAggregatorService(makeCache(), new CircuitBreakerService(),
      makeMockProvider('a', async () => {}),
      makeMockProvider('b', async () => {}),
      makeMockProvider('c', async () => {}));

    it('single value', () => expect(svc().median([42])).toBe(42));
    it('odd-length array', () => expect(svc().median([3, 1, 2])).toBe(2));
    it('even-length array → average of middle two', () => expect(svc().median([1, 2, 3, 4])).toBe(2.5));
    it('two values', () => expect(svc().median([1.0, 1.2])).toBeCloseTo(1.1));
    it('empty array → 0', () => expect(svc().median([])).toBe(0));
    it('does not mutate input', () => {
      const arr = [3, 1, 2];
      svc().median(arr);
      expect(arr).toEqual([3, 1, 2]);
    });
    it('handles duplicate values', () => expect(svc().median([0.9, 0.9, 0.9])).toBe(0.9));
    it('five values', () => expect(svc().median([5, 3, 1, 4, 2])).toBe(3));
  });

  // ═══ computeMedianRates() ═════════════════════════════════════════════════

  describe('FxAggregatorService — computeMedianRates()', () => {
    const svc = new FxAggregatorService(makeCache(), new CircuitBreakerService(),
      makeMockProvider('a', async () => {}),
      makeMockProvider('b', async () => {}),
      makeMockProvider('c', async () => {}));

    it('median across three providers', () => {
      const r = svc.computeMedianRates('USD', [
        makeRate('A', { EUR: 0.90, GBP: 0.78 }),
        makeRate('B', { EUR: 0.92, GBP: 0.80 }),
        makeRate('C', { EUR: 0.94, GBP: 0.82 }),
      ]);
      expect(r.rates.EUR).toBe(0.92);
      expect(r.rates.GBP).toBe(0.80);
    });

    it('ignores missing currency from one provider', () => {
      const r = svc.computeMedianRates('USD', [
        makeRate('A', { EUR: 0.90, JPY: 150 }),
        makeRate('B', { EUR: 0.92 }),
        makeRate('C', { EUR: 0.94, JPY: 152 }),
      ]);
      expect(r.rates.JPY).toBe(151); // median([150,152]) = 151
    });

    it('filters out zero values', () => {
      const r = svc.computeMedianRates('USD', [
        makeRate('A', { EUR: 0.90 }),
        makeRate('B', { EUR: 0 }),
      ]);
      expect(r.rates.EUR).toBe(0.90);
    });

    it('filters out NaN values', () => {
      const r = svc.computeMedianRates('USD', [
        makeRate('A', { EUR: 0.90 }),
        makeRate('B', { EUR: NaN }),
      ]);
      expect(r.rates.EUR).toBe(0.90);
    });

    it('returns all provider names', () => {
      const r = svc.computeMedianRates('USD', [
        makeRate('providerA', { EUR: 0.90 }),
        makeRate('providerB', { EUR: 0.92 }),
      ]);
      expect(r.providers).toHaveLength(2);
      expect(r.providers[0]).toBe('providerA');
    });

    it('sets fromCache: false on fresh result', () => {
      const r = svc.computeMedianRates('USD', [makeRate('A', { EUR: 0.9 })]);
      expect(r.fromCache).toBe(false);
    });
  });

  // ═══ getRates() — happy path ═══════════════════════════════════════════════

  promises.push((async () => {
    describe('FxAggregatorService — getRates() happy path', () => {});
    console.log('\nFxAggregatorService — getRates() happy path');

    await it('returns aggregated median from all three providers', async () => {
      const cb = new CircuitBreakerService();
      const svc = new FxAggregatorService(
        makeCache(), cb,
        makeMockProvider('providerA', async () => makeRate('providerA', { EUR: 0.90 })),
        makeMockProvider('providerB', async () => makeRate('providerB', { EUR: 0.92 })),
        makeMockProvider('providerC', async () => makeRate('providerC', { EUR: 0.94 })),
      );
      const r = await svc.getRates('USD');
      expect(r.success).toBe(true);
      expect(r.data.rates.EUR).toBe(0.92);
      expect(r.data.providers).toHaveLength(3);
    });

    await it('returns cached result on cache hit', async () => {
      const cached = { base: 'USD', rates: { EUR: 0.88 }, providers: ['A'], cachedAt: Date.now(), fromCache: false };
      const cache = makeCache({ 'fx:rates:USD': cached });
      let fetchCalled = false;
      const svc = new FxAggregatorService(
        cache, new CircuitBreakerService(),
        makeMockProvider('providerA', async () => { fetchCalled = true; return makeRate('providerA', {}); }),
        makeMockProvider('providerB', async () => makeRate('providerB', {})),
        makeMockProvider('providerC', async () => makeRate('providerC', {})),
      );
      const r = await svc.getRates('USD');
      expect(r.success).toBe(true);
      expect(r.data.fromCache).toBe(true);
      expect(fetchCalled).toBe(false);
    });

    await it('succeeds with only two providers', async () => {
      const svc = new FxAggregatorService(
        makeCache(), new CircuitBreakerService(),
        makeMockProvider('providerA', async () => makeRate('providerA', { EUR: 0.90 })),
        makeMockProvider('providerB', async () => { throw new Error('timeout'); }),
        makeMockProvider('providerC', async () => makeRate('providerC', { EUR: 0.94 })),
      );
      const r = await svc.getRates('USD');
      expect(r.success).toBe(true);
      expect(r.data.providers).toHaveLength(2);
      expect(r.data.rates.EUR).toBeCloseTo(0.92); // median([0.90, 0.94]) = 0.92
    });

    await it('stores result in both live and last-known cache', async () => {
      const cache = makeCache();
      const svc = new FxAggregatorService(
        cache, new CircuitBreakerService(),
        makeMockProvider('providerA', async () => makeRate('providerA', { EUR: 0.90 })),
        makeMockProvider('providerB', async () => makeRate('providerB', { EUR: 0.92 })),
        makeMockProvider('providerC', async () => makeRate('providerC', { EUR: 0.94 })),
      );
      await svc.getRates('USD');
      expect(cache._store['fx:rates:USD']).toBeDefined();
      expect(cache._store['fx:last_known:USD']).toBeDefined();
    });
  })());

  // ═══ getRates() — fallback ════════════════════════════════════════════════

  promises.push((async () => {
    console.log('\nFxAggregatorService — getRates() fallback');

    await it('returns last-known cache when all providers fail', async () => {
      const lastKnown = { base: 'USD', rates: { EUR: 0.88 }, providers: ['A'], cachedAt: Date.now() - 120000, fromCache: false };
      const cache = makeCache({ 'fx:last_known:USD': lastKnown });
      const svc = new FxAggregatorService(
        cache, new CircuitBreakerService(),
        makeMockProvider('providerA', async () => { throw new Error('down'); }),
        makeMockProvider('providerB', async () => { throw new Error('down'); }),
        makeMockProvider('providerC', async () => { throw new Error('down'); }),
      );
      const r = await svc.getRates('USD');
      expect(r.success).toBe(false);
      expect(r.error).toBeDefined();
      expect(r.lastKnown.rates.EUR).toBe(0.88);
      expect(r.lastKnown.warning).toBeDefined();
      expect(r.lastKnown.fromCache).toBe(true);
    });

    await it('returns service-unavailable error with no cache at all', async () => {
      const svc = new FxAggregatorService(
        makeCache(), new CircuitBreakerService(),
        makeMockProvider('providerA', async () => { throw new Error('down'); }),
        makeMockProvider('providerB', async () => { throw new Error('down'); }),
        makeMockProvider('providerC', async () => { throw new Error('down'); }),
      );
      const r = await svc.getRates('USD');
      expect(r.success).toBe(false);
      expect(r.lastKnown).toBeUndefined();
      expect(r.error).toBeDefined();
    });
  })());

  // ═══ Circuit breaker integration with getRates() ══════════════════════════

  promises.push((async () => {
    console.log('\nCircuit breaker integration with getRates()');

    await it('fast-fails open circuit — does NOT call provider fetchRates', async () => {
      const cb = new CircuitBreakerService(5, 60000);
      for (let i = 0; i < 5; i++) cb.recordFailure('providerA');

      let aCalled = false;
      const svc = new FxAggregatorService(
        makeCache(), cb,
        makeMockProvider('providerA', async () => { aCalled = true; return makeRate('providerA', {}); }),
        makeMockProvider('providerB', async () => makeRate('providerB', { EUR: 0.92 })),
        makeMockProvider('providerC', async () => makeRate('providerC', { EUR: 0.94 })),
      );
      const r = await svc.getRates('USD');
      expect(aCalled).toBe(false);
      expect(r.success).toBe(true); // B and C still succeed
    });

    await it('circuit opens after exactly 5 consecutive failures in getRates', async () => {
      const cb = new CircuitBreakerService(5, 60000);
      const cache = makeCache();
      let callCount = 0;
      const svc = new FxAggregatorService(
        cache, cb,
        makeMockProvider('providerA', async () => { callCount++; throw new Error('fail'); }),
        makeMockProvider('providerB', async () => { throw new Error('fail'); }),
        makeMockProvider('providerC', async () => { throw new Error('fail'); }),
      );

      // 5 calls, each failing all 3 providers
      for (let i = 0; i < 5; i++) await svc.getRates('USD');

      expect(cb.getStatus('providerA').state).toBe(CircuitState.OPEN);
      expect(callCount).toBe(5); // called exactly 5 times before opening

      // 6th call — circuit is now open, providerA not called
      await svc.getRates('USD');
      expect(callCount).toBe(5); // no additional calls
    });

    await it('providerA recovers: OPEN → HALF_OPEN → CLOSED on probe success', async () => {
      const cb = new CircuitBreakerService(5, 60000);
      for (let i = 0; i < 5; i++) cb.recordFailure('providerA');
      // Simulate timeout elapsed
      cb.circuits.get('providerA').nextAttemptTime = Date.now() - 1;

      const svc = new FxAggregatorService(
        makeCache(), cb,
        makeMockProvider('providerA', async () => makeRate('providerA', { EUR: 0.90 })),
        makeMockProvider('providerB', async () => makeRate('providerB', { EUR: 0.92 })),
        makeMockProvider('providerC', async () => makeRate('providerC', { EUR: 0.94 })),
      );

      await svc.getRates('USD');
      expect(cb.getStatus('providerA').state).toBe(CircuitState.CLOSED);
    });
  })());

  await Promise.all(promises);

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60));
  console.log(`Tests: ${passed + failed} total  |  ${passed} passed  |  ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach(({ name, err }) => console.log(`  ✗ ${name}\n    ${err.message}`));
    process.exit(1);
  } else {
    console.log('\nAll tests passed ✓');
  }
}

runAll().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
