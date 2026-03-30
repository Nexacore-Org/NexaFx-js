import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';

import { FxAnalyticsModule } from '../src/modules/fx/fx-analytics.module';
import { FxAnalyticsService, FX_AGGREGATOR_SERVICE, FxRateResult } from '../src/modules/fx/services/fx-analytics.service';
import { RateSnapshot } from '../src/modules/fx/entities/rate-snapshot.entity';
import { ProviderHealthMetric, CircuitBreakerState } from '../src/modules/fx/entities/provider-health-metric.entity';
import { RATE_SNAPSHOT_QUEUE } from '../src/modules/fx/jobs/rate-snapshot.job';
import { OhlcGranularity } from '../src/modules/fx/dto/fx-analytics.dto';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockAggregatedRates: FxRateResult[] = [
  {
    pair: 'USD/NGN',
    bid: 1580.50,
    ask: 1581.50,
    providers: [
      { name: 'providerA', bid: 1580.45, ask: 1581.45, confidence: 0.95, circuitBreakerState: 'CLOSED', latencyMs: 120 },
      { name: 'providerB', bid: 1580.55, ask: 1581.55, confidence: 0.88, circuitBreakerState: 'CLOSED', latencyMs: 210 },
    ],
    timestamp: new Date(),
  },
  {
    pair: 'EUR/USD',
    bid: 1.0842,
    ask: 1.0844,
    providers: [
      { name: 'providerA', bid: 1.0842, ask: 1.0844, confidence: 0.97, circuitBreakerState: 'CLOSED', latencyMs: 95 },
    ],
    timestamp: new Date(),
  },
];

const mockAggregator = {
  getAllPairRates: jest.fn().mockResolvedValue(mockAggregatedRates),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({}),
  getRepeatableJobs: jest.fn().mockResolvedValue([]),
  removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSnapshot(pair: string, bucketHour: Date, overrides: Partial<RateSnapshot> = {}): Partial<RateSnapshot> {
  return {
    id: Math.random().toString(36).slice(2),
    pair,
    bucketHour,
    open: 1580,
    high: 1590,
    low: 1570,
    close: 1585,
    bid: 1584,
    ask: 1586,
    spread: 2,
    spreadPct: 0.00126,
    sampleCount: 3,
    confidenceScore: 0.92,
    createdAt: new Date(),
    ...overrides,
  };
}

function hoursAgo(n: number): Date {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() - n);
  return d;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FX Analytics (e2e)', () => {
  let app: INestApplication;
  let analyticsService: FxAnalyticsService;
  let snapshotRepo: jest.Mocked<Partial<Repository<RateSnapshot>>>;
  let healthRepo: jest.Mocked<Partial<Repository<ProviderHealthMetric>>>;

  beforeAll(async () => {
    snapshotRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((dto) => dto as RateSnapshot),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };

    healthRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((dto) => dto as ProviderHealthMetric),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [FxAnalyticsModule],
    })
      .overrideProvider(getRepositoryToken(RateSnapshot))
      .useValue(snapshotRepo)
      .overrideProvider(getRepositoryToken(ProviderHealthMetric))
      .useValue(healthRepo)
      .overrideProvider(FX_AGGREGATOR_SERVICE)
      .useValue(mockAggregator)
      .overrideProvider(getQueueToken(RATE_SNAPSHOT_QUEUE))
      .useValue(mockQueue)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    analyticsService = module.get(FxAnalyticsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /fx/rates ───────────────────────────────────────────────────────────

  describe('GET /fx/rates', () => {
    it('returns 200 with bid, ask, spread and per-provider confidence', async () => {
      mockAggregator.getAllPairRates.mockResolvedValueOnce(mockAggregatedRates);

      const res = await request(app.getHttpServer()).get('/fx/rates').expect(200);

      expect(res.body.count).toBe(2);
      const usdNgn = res.body.data.find((r: any) => r.pair === 'USD/NGN');
      expect(usdNgn).toBeDefined();
      expect(usdNgn.bid).toBeCloseTo(1580.50, 2);
      expect(usdNgn.ask).toBeCloseTo(1581.50, 2);
      expect(usdNgn.spread).toBeCloseTo(1.0, 2);
      expect(usdNgn.spreadPct).toBeGreaterThan(0);
      expect(Array.isArray(usdNgn.providers)).toBe(true);
      expect(usdNgn.providers).toHaveLength(2);
      expect(usdNgn.providers[0]).toMatchObject({
        provider: 'providerA',
        confidence: expect.any(Number),
        circuitBreakerState: 'CLOSED',
      });
    });

    it('returns 200 with empty data when aggregator has no pairs', async () => {
      mockAggregator.getAllPairRates.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer()).get('/fx/rates').expect(200);
      expect(res.body.count).toBe(0);
      expect(res.body.data).toEqual([]);
    });
  });

  // ── GET /fx/rates/:pair/history ─────────────────────────────────────────────

  describe('GET /fx/rates/:pair/history', () => {
    const snapshots = [
      makeSnapshot('USD/NGN', hoursAgo(3)),
      makeSnapshot('USD/NGN', hoursAgo(2)),
      makeSnapshot('USD/NGN', hoursAgo(1)),
    ] as RateSnapshot[];

    it('returns OHLC bars at default 1h granularity', async () => {
      (snapshotRepo.find as jest.Mock).mockResolvedValueOnce(snapshots);
      (snapshotRepo.findOne as jest.Mock).mockResolvedValueOnce(null); // not called for non-empty result

      const res = await request(app.getHttpServer())
        .get('/fx/rates/USD-NGN/history')
        .expect(200);

      expect(res.body.pair).toBe('USD/NGN'); // normalised
      expect(res.body.granularity).toBe(OhlcGranularity.ONE_HOUR);
      expect(Array.isArray(res.body.bars)).toBe(true);
      expect(res.body.bars.length).toBe(3);
      const bar = res.body.bars[0];
      expect(bar).toHaveProperty('open');
      expect(bar).toHaveProperty('high');
      expect(bar).toHaveProperty('low');
      expect(bar).toHaveProperty('close');
      expect(bar).toHaveProperty('spread');
      expect(bar).toHaveProperty('spreadPct');
    });

    it('aggregates hourly snapshots into daily bars at 1d granularity', async () => {
      const todaySnapshots = Array.from({ length: 24 }, (_, i) =>
        makeSnapshot('EUR/USD', hoursAgo(23 - i)) as RateSnapshot,
      );
      (snapshotRepo.find as jest.Mock).mockResolvedValueOnce(todaySnapshots);

      const res = await request(app.getHttpServer())
        .get('/fx/rates/EUR-USD/history')
        .query({ granularity: '1d' })
        .expect(200);

      expect(res.body.granularity).toBe('1d');
      // 24 hourly snapshots within the same UTC day → 1 daily bar (or 2 if straddling midnight)
      expect(res.body.bars.length).toBeGreaterThanOrEqual(1);
      expect(res.body.bars.length).toBeLessThanOrEqual(2);
    });

    it('paginates results with limit & offset', async () => {
      const many = Array.from({ length: 20 }, (_, i) =>
        makeSnapshot('USD/NGN', hoursAgo(20 - i)) as RateSnapshot,
      );
      (snapshotRepo.find as jest.Mock).mockResolvedValueOnce(many);

      const res = await request(app.getHttpServer())
        .get('/fx/rates/USD-NGN/history')
        .query({ limit: 5, offset: 5 })
        .expect(200);

      expect(res.body.total).toBe(20);
      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(5);
      expect(res.body.bars).toHaveLength(5);
    });

    it('returns 404 for an unknown pair', async () => {
      (snapshotRepo.find as jest.Mock).mockResolvedValueOnce([]);
      (snapshotRepo.findOne as jest.Mock).mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/fx/rates/FAKE-PAIR/history')
        .expect(404);
    });

    it('rejects invalid granularity with 400', async () => {
      await request(app.getHttpServer())
        .get('/fx/rates/USD-NGN/history')
        .query({ granularity: '5m' })
        .expect(400);
    });
  });

  // ── GET /admin/fx/providers ─────────────────────────────────────────────────

  describe('GET /admin/fx/providers', () => {
    const makeHealth = (
      name: string,
      cbState: CircuitBreakerState,
      req1h: number,
      err1h: number,
    ): ProviderHealthMetric =>
      ({
        id: Math.random().toString(36).slice(2),
        providerName: name,
        requestCount1h: req1h,
        errorCount1h: err1h,
        totalRequests: req1h,
        totalErrors: err1h,
        avgLatencyMs: 150,
        circuitBreakerState: cbState,
        lastTrippedAt: cbState === CircuitBreakerState.OPEN ? new Date() : null,
        lastSuccessAt: new Date(),
        updatedAt: new Date(),
      } as ProviderHealthMetric);

    it('returns provider list with uptime and circuit-breaker state', async () => {
      (healthRepo.find as jest.Mock).mockResolvedValueOnce([
        makeHealth('providerA', CircuitBreakerState.CLOSED, 100, 5),
        makeHealth('providerB', CircuitBreakerState.OPEN, 50, 30),
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/fx/providers')
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      const a = res.body.data.find((p: any) => p.provider === 'providerA');
      const b = res.body.data.find((p: any) => p.provider === 'providerB');

      expect(a.status).toBe('HEALTHY');
      expect(a.uptimePct).toBeCloseTo(95, 0);
      expect(b.status).toBe('DOWN');   // OPEN circuit → DOWN
      expect(b.circuitBreakerState).toBe('OPEN');
    });

    it('flags provider with >20% error rate in last hour as DEGRADED', async () => {
      (healthRepo.find as jest.Mock).mockResolvedValueOnce([
        makeHealth('providerC', CircuitBreakerState.CLOSED, 100, 25), // 25% error rate
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/fx/providers')
        .expect(200);

      const c = res.body.data.find((p: any) => p.provider === 'providerC');
      expect(c.status).toBe('DEGRADED');
      expect(c.errorRate1h).toBeCloseTo(0.25, 2);
    });

    it('returns degradedCount and downCount in envelope', async () => {
      (healthRepo.find as jest.Mock).mockResolvedValueOnce([
        makeHealth('p1', CircuitBreakerState.CLOSED, 100, 25), // DEGRADED
        makeHealth('p2', CircuitBreakerState.OPEN, 10, 10),    // DOWN
        makeHealth('p3', CircuitBreakerState.CLOSED, 100, 1),  // HEALTHY
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/fx/providers')
        .expect(200);

      expect(res.body.degradedCount).toBe(1);
      expect(res.body.downCount).toBe(1);
    });

    it('returns empty list when no providers tracked yet', async () => {
      (healthRepo.find as jest.Mock).mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/admin/fx/providers')
        .expect(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ── Unit: FxAnalyticsService ────────────────────────────────────────────────

  describe('FxAnalyticsService unit', () => {
    describe('buildLiveRates', () => {
      it('computes correct mid, spread, spreadPct', () => {
        const rates = analyticsService.buildLiveRates([mockAggregatedRates[0]]);
        expect(rates[0].mid).toBeCloseTo(1581.0, 2);
        expect(rates[0].spread).toBeCloseTo(1.0, 2);
        expect(rates[0].spreadPct).toBeGreaterThan(0);
      });
    });

    describe('upsertHourlySnapshot', () => {
      it('creates a new row for a new bucket', async () => {
        (snapshotRepo.findOne as jest.Mock).mockResolvedValueOnce(null);
        (snapshotRepo.create as jest.Mock).mockImplementation((d) => d);
        (snapshotRepo.save as jest.Mock).mockResolvedValueOnce({});

        await analyticsService.upsertHourlySnapshot(mockAggregatedRates[0]);

        expect(snapshotRepo.save).toHaveBeenCalledTimes(1);
        const saved = (snapshotRepo.save as jest.Mock).mock.calls[0][0];
        expect(saved.pair).toBe('USD/NGN');
        expect(saved.sampleCount).toBe(1);
      });

      it('updates an existing row and increments sampleCount', async () => {
        const existing = makeSnapshot('USD/NGN', new Date(), { sampleCount: 2, confidenceScore: 0.9 }) as RateSnapshot;
        (snapshotRepo.findOne as jest.Mock).mockResolvedValueOnce(existing);
        (snapshotRepo.save as jest.Mock).mockResolvedValueOnce({});

        await analyticsService.upsertHourlySnapshot(mockAggregatedRates[0]);

        expect(snapshotRepo.save).toHaveBeenCalledTimes(1);
        const saved = (snapshotRepo.save as jest.Mock).mock.calls[0][0];
        expect(saved.sampleCount).toBe(3);
      });
    });

    describe('resetHourlyCounters', () => {
      it('calls the query builder update', async () => {
        const qb = {
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        };
        (healthRepo.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);

        await analyticsService.resetHourlyCounters();

        expect(qb.set).toHaveBeenCalledWith({ requestCount1h: 0, errorCount1h: 0 });
        expect(qb.execute).toHaveBeenCalled();
      });
    });
  });
});
