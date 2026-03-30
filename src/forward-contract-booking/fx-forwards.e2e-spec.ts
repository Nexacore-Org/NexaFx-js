/**
 * test/fx-forwards.e2e-spec.ts
 *
 * E2E test suite for the FX Forward Contract module.
 * Covers: book, get, cancel, settle, and risk-exposure alert scenarios.
 *
 * Run with:  npm run test:e2e -- --testPathPattern=fx-forwards
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { ForwardContract, ForwardContractStatus } from '../src/modules/fx/entities/forward-contract.entity';
import { ForwardContractService, EXCHANGE_RATE_PROVIDER } from '../src/modules/fx/services/forward-contract.service';
import { ForwardContractController } from '../src/modules/fx/controllers/forward-contract.controller';
import { ForwardSettlementJob } from '../src/modules/fx/jobs/forward-settlement.job';
import { ExposureService } from '../src/modules/risk-engine/exposure.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_RATE = 1550; // 1 USD = 1550 NGN (example locked rate)
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 days
const PAST_DATE   = new Date(Date.now() - 1000).toISOString(); // 1 second ago

function makeRepo() {
  const store: ForwardContract[] = [];
  let idCounter = 1;

  const repo = {
    create: jest.fn((data: Partial<ForwardContract>) => ({ ...data })),
    save:   jest.fn(async (c: Partial<ForwardContract>) => {
      const contract = { ...c, id: `uuid-${idCounter++}`, createdAt: new Date(), updatedAt: new Date() } as ForwardContract;
      store.push(contract);
      return contract;
    }),
    find: jest.fn(async (opts?: any) => {
      if (!opts?.where) return [...store];
      const { userId, status, maturityDate: mDate } = opts.where ?? {};
      return store.filter(c => {
        if (userId && c.userId !== userId) return false;
        if (status && c.status !== status) return false;
        // LessThanOrEqual simulation
        if (mDate && c.maturityDate > mDate.value) return false;
        return true;
      });
    }),
    findOne: jest.fn(async (opts: any) => store.find(c => c.id === opts.where.id) ?? null),
    update: jest.fn(async (id: string, partial: Partial<ForwardContract>) => {
      const idx = store.findIndex(c => c.id === id);
      if (idx !== -1) Object.assign(store[idx], partial);
    }),
    _store: store, // expose for assertions
  };
  return repo as unknown as jest.Mocked<Repository<ForwardContract>> & { _store: ForwardContract[] };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('FX Forward Contracts (e2e)', () => {
  let app: INestApplication;
  let repo: ReturnType<typeof makeRepo>;
  let exposureService: ExposureService;
  let settlementJob: ForwardSettlementJob;
  let forwardService: ForwardContractService;

  const mockRateProvider = {
    getCurrentRate: jest.fn().mockResolvedValue(MOCK_RATE),
  };

  const mockJwtGuard = { canActivate: () => true };

  beforeEach(async () => {
    repo = makeRepo();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ScheduleModule.forRoot(),
      ],
      controllers: [ForwardContractController],
      providers: [
        ForwardContractService,
        ForwardSettlementJob,
        ExposureService,
        { provide: getRepositoryToken(ForwardContract), useValue: repo },
        { provide: EXCHANGE_RATE_PROVIDER, useValue: mockRateProvider },
      ],
    })
      .overrideGuard(require('../src/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue(mockJwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Simulate authenticated user on every request
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { sub: 'user-123', id: 'user-123' };
      next();
    });
    await app.init();

    exposureService = moduleRef.get(ExposureService);
    settlementJob   = moduleRef.get(ForwardSettlementJob);
    forwardService  = moduleRef.get(ForwardContractService);
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  // ─── 1. Book ──────────────────────────────────────────────────────────────

  describe('POST /fx/forwards — booking', () => {
    it('creates a contract with status ACTIVE and a locked rate', async () => {
      const res = await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({
          baseCurrency: 'USD',
          quoteCurrency: 'NGN',
          notionalAmount: 1000,
          maturityDate: FUTURE_DATE,
        })
        .expect(201);

      expect(res.body.status).toBe(ForwardContractStatus.ACTIVE);
      expect(res.body.lockedRate).toBe(MOCK_RATE);
      expect(res.body.collateralAmount).toBeGreaterThan(0);
    });

    it('rejects a maturity date in the past', async () => {
      await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({
          baseCurrency: 'USD',
          quoteCurrency: 'NGN',
          notionalAmount: 1000,
          maturityDate: PAST_DATE,
        })
        .expect(400);
    });

    it('rejects collateral below the minimum required', async () => {
      await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({
          baseCurrency: 'USD',
          quoteCurrency: 'NGN',
          notionalAmount: 1000,
          maturityDate: FUTURE_DATE,
          collateralAmount: 1, // way below 10 % minimum
        })
        .expect(400);
    });

    it('blocks exactly the provided collateral', async () => {
      const collateral = 200; // 20 % of 1000
      const res = await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({
          baseCurrency: 'USD',
          quoteCurrency: 'NGN',
          notionalAmount: 1000,
          maturityDate: FUTURE_DATE,
          collateralAmount: collateral,
        })
        .expect(201);

      expect(res.body.collateralAmount).toBe(collateral);
    });

    it('increments ExposureService on successful booking', async () => {
      const spy = jest.spyOn(exposureService, 'addExposure');
      await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({ baseCurrency: 'EUR', quoteCurrency: 'NGN', notionalAmount: 500, maturityDate: FUTURE_DATE })
        .expect(201);

      expect(spy).toHaveBeenCalledWith('EUR', 'NGN', 500);
    });
  });

  // ─── 2. GET ───────────────────────────────────────────────────────────────

  describe('GET /fx/forwards — listing', () => {
    it('returns an empty list when no contracts exist', async () => {
      const res = await request(app.getHttpServer()).get('/fx/forwards').expect(200);
      expect(res.body).toEqual([]);
    });

    it('returns contracts for the authenticated user', async () => {
      // Book two contracts
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post('/fx/forwards')
          .send({ baseCurrency: 'USD', quoteCurrency: 'NGN', notionalAmount: 500, maturityDate: FUTURE_DATE });
      }
      const res = await request(app.getHttpServer()).get('/fx/forwards').expect(200);
      expect(res.body.length).toBe(2);
    });

    it('GET /fx/forwards/:id returns the correct contract', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({ baseCurrency: 'USD', quoteCurrency: 'NGN', notionalAmount: 500, maturityDate: FUTURE_DATE })
        .expect(201);

      const id = bookRes.body.id;
      const res = await request(app.getHttpServer()).get(`/fx/forwards/${id}`).expect(200);
      expect(res.body.id).toBe(id);
    });
  });

  // ─── 3. Cancellation ──────────────────────────────────────────────────────

  describe('DELETE /fx/forwards/:id — cancellation', () => {
    it('cancels an ACTIVE contract, charges a fee, and releases exposure', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({ baseCurrency: 'USD', quoteCurrency: 'NGN', notionalAmount: 1000, maturityDate: FUTURE_DATE })
        .expect(201);

      const id = bookRes.body.id;
      const removeSpy = jest.spyOn(exposureService, 'removeExposure');

      const cancelRes = await request(app.getHttpServer())
        .delete(`/fx/forwards/${id}`)
        .send({ reason: 'hedge no longer needed' })
        .expect(200);

      expect(cancelRes.body.status).toBe(ForwardContractStatus.CANCELLED);
      expect(cancelRes.body.cancellationFeeCharged).toBeGreaterThan(0);
      expect(removeSpy).toHaveBeenCalledWith('USD', 'NGN', 1000);
    });

    it('returns 400 when trying to cancel an already-cancelled contract', async () => {
      const bookRes = await request(app.getHttpServer())
        .post('/fx/forwards')
        .send({ baseCurrency: 'USD', quoteCurrency: 'NGN', notionalAmount: 1000, maturityDate: FUTURE_DATE })
        .expect(201);
      const id = bookRes.body.id;

      // First cancellation
      await request(app.getHttpServer()).delete(`/fx/forwards/${id}`).expect(200);
      // Second attempt should fail
      await request(app.getHttpServer()).delete(`/fx/forwards/${id}`).expect(400);
    });
  });

  // ─── 4. Settlement ────────────────────────────────────────────────────────

  describe('Settlement cron — settleDueContracts()', () => {
    it('settles contracts using the locked rate, not the market rate', async () => {
      // Book a contract with maturity in the past (simulate via service directly)
      const contract = await forwardService.bookForward(
        'user-123',
        {
          baseCurrency: 'GBP',
          quoteCurrency: 'NGN',
          notionalAmount: 200,
          maturityDate: FUTURE_DATE, // will override below
        },
        mockRateProvider,
      );
      // Move maturity to past manually
      const stored = repo._store.find(c => c.id === contract.id)!;
      stored.maturityDate = new Date(Date.now() - 1000);

      // Change market rate — settlement must still use lockedRate
      mockRateProvider.getCurrentRate.mockResolvedValue(9999);

      const result = await forwardService.settleDueContracts();

      expect(result.settled).toBe(1);
      expect(result.errors).toBe(0);

      const updated = repo._store.find(c => c.id === contract.id)!;
      expect(updated.status).toBe(ForwardContractStatus.SETTLED);
      // settlementRate must equal the original locked rate, not 9999
      expect(updated.settlementRate).toBe(MOCK_RATE);
    });

    it('does not settle contracts that are not yet due', async () => {
      await forwardService.bookForward(
        'user-123',
        { baseCurrency: 'USD', quoteCurrency: 'NGN', notionalAmount: 100, maturityDate: FUTURE_DATE },
        mockRateProvider,
      );

      const result = await forwardService.settleDueContracts();
      expect(result.settled).toBe(0);
    });

    it('does not settle already-cancelled contracts', async () => {
      const contract = await forwardService.bookForward(
        'user-123',
        { baseCurrency: 'USD', quoteCurrency: 'NGN', notionalAmount: 100, maturityDate: FUTURE_DATE },
        mockRateProvider,
      );
      // Cancel it
      await forwardService.cancelContract(contract.id, 'user-123', {});
      // Move maturity to past
      const stored = repo._store.find(c => c.id === contract.id)!;
      stored.maturityDate = new Date(Date.now() - 1000);

      const result = await forwardService.settleDueContracts();
      // Cron query filters by status=ACTIVE so cancelled contract won't appear
      expect(result.settled).toBe(0);
    });
  });

  // ─── 5. Risk exposure & alert ─────────────────────────────────────────────

  describe('ExposureService — risk threshold alerts', () => {
    it('emits a WARN log when exposure exceeds RISK_THRESHOLD', async () => {
      const warnSpy = jest.spyOn(
        (exposureService as any).logger,
        'warn',
      );

      // Default threshold is 1_000_000; book a 2M notional
      exposureService.addExposure('USD', 'NGN', 2_000_000);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RISK ALERT'),
      );
    });

    it('tracks cumulative exposure correctly across multiple bookings', async () => {
      exposureService.addExposure('EUR', 'NGN', 300_000);
      exposureService.addExposure('EUR', 'NGN', 200_000);
      const exp = exposureService.getExposure('EUR', 'NGN');
      expect(exp?.totalNotional).toBe(500_000);
      expect(exp?.contractCount).toBe(2);
    });

    it('decrements exposure on settlement', async () => {
      exposureService.addExposure('GBP', 'NGN', 400_000);
      exposureService.removeExposure('GBP', 'NGN', 400_000);
      const exp = exposureService.getExposure('GBP', 'NGN');
      expect(exp?.totalNotional).toBe(0);
      expect(exp?.contractCount).toBe(0);
    });

    it('GET /fx/forwards/exposure/all returns exposure snapshots', async () => {
      exposureService.addExposure('USD', 'NGN', 50_000);
      const res = await request(app.getHttpServer())
        .get('/fx/forwards/exposure/all')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((e: any) => e.currencyPair === 'USD/NGN')).toBe(true);
    });
  });
});
