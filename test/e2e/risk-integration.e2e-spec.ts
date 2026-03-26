import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RiskState } from '../src/modules/risk-engine/entities/risk-state.entity';
import { Trade } from '../src/modules/transactions/entities/trade.entity';
import { RiskManagerService } from '../src/modules/risk-engine/services/risk-manager.service';

/**
 * Integration test: trade → risk update → next trade blocked by updated limits
 * Covers acceptance criteria from issue #314.
 */
describe('Risk Engine Integration (e2e)', () => {
  let app: INestApplication;
  let riskStateRepo: Repository<RiskState>;
  let tradeRepo: Repository<Trade>;
  let riskManagerService: RiskManagerService;
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(/* your validation pipe */);
    await app.init();

    riskStateRepo = moduleFixture.get<Repository<RiskState>>(
      getRepositoryToken(RiskState),
    );
    tradeRepo = moduleFixture.get<Repository<Trade>>(
      getRepositoryToken(Trade),
    );
    riskManagerService =
      moduleFixture.get<RiskManagerService>(RiskManagerService);

    // Create a test user and obtain auth token — adjust to your auth flow
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'risktest@nexafx.io', password: 'TestPassword1!' });

    authToken = loginRes.body.access_token;
    testUserId = loginRes.body.user.id;

    // Seed a risk profile for the test user with tight limits
    await riskStateRepo.upsert(
      {
        userId: testUserId,
        dailyLoss: 0,
        dailyLossLimit: 500,
        maxPositionSize: 300,
        maxOpenPositions: 5,
        openPositions: 0,
        circuitBreakerActive: false,
        isActive: true,
      },
      ['userId'],
    );
  });

  afterAll(async () => {
    await tradeRepo.delete({ userId: testUserId });
    await riskStateRepo.delete({ userId: testUserId });
    await app.close();
  });

  // ── Test 1: Allowed trade passes the risk gate ────────────────────────────

  it('should allow a trade within risk limits', async () => {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        currencyPair: 'EUR/USD',
        amount: 200, // under maxPositionSize of 300
        direction: 'LONG',
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body).toHaveProperty('id');
  });

  // ── Test 2: Trade exceeding maxPositionSize is blocked with 403 ───────────

  it('should block a trade that exceeds maxPositionSize (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        currencyPair: 'EUR/USD',
        amount: 999, // exceeds maxPositionSize of 300
        direction: 'LONG',
      });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body).toHaveProperty('reason');
    expect(res.body).toHaveProperty('currentMetrics');
    expect(res.body.currentMetrics).toHaveProperty('maxPositionSize', 300);
  });

  // ── Test 3: trade → risk update → circuit breaker fires ──────────────────

  it('should block all trades after daily loss limit is breached', async () => {
    // Simulate daily loss reaching the limit
    await riskStateRepo.update(
      { userId: testUserId },
      { dailyLoss: 500, circuitBreakerActive: true },
    );

    // Any subsequent trade — even a tiny one — should be blocked
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        currencyPair: 'GBP/USD',
        amount: 10,
        direction: 'SHORT',
      });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.reason).toMatch(/daily loss limit/i);
    expect(res.body.currentMetrics.circuitBreakerActive).toBe(true);
  });

  // ── Test 4: refreshRiskState updates state after trade completion ─────────

  it('should update RiskState after trade completion via refreshRiskState', async () => {
    // Reset circuit breaker for this sub-test
    await riskStateRepo.update(
      { userId: testUserId },
      { dailyLoss: 0, circuitBreakerActive: false },
    );

    // Manually insert a completed trade with a loss
    await tradeRepo.save({
      userId: testUserId,
      currencyPair: 'USD/JPY',
      amount: 100,
      pnl: -200,
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    // Refresh risk state
    const updatedState = await riskManagerService.refreshRiskState(testUserId);

    expect(updatedState.dailyLoss).toBe(200);
    expect(updatedState.circuitBreakerActive).toBe(false); // 200 < 500 limit
  });

  // ── Test 5: Full integration flow — trade → refresh → breach → block ──────

  it('integration: trade completion triggers risk refresh and blocks next trade', async () => {
    // Reset
    await riskStateRepo.update(
      { userId: testUserId },
      { dailyLoss: 0, circuitBreakerActive: false },
    );
    await tradeRepo.delete({ userId: testUserId });

    // Insert a completed trade that pushes loss to the limit
    await tradeRepo.save({
      userId: testUserId,
      currencyPair: 'USD/CHF',
      amount: 500,
      pnl: -500, // exactly hits the 500 limit
      status: 'COMPLETED',
      completedAt: new Date(),
    });

    // Simulate what happens when completeTrade() fires the event
    await riskManagerService.refreshRiskState(testUserId);

    // Verify circuit breaker is now active
    const riskState = await riskStateRepo.findOne({
      where: { userId: testUserId },
    });
    expect(riskState?.circuitBreakerActive).toBe(true);

    // Attempt a new trade — should be blocked
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        currencyPair: 'EUR/GBP',
        amount: 50,
        direction: 'LONG',
      });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.currentMetrics.circuitBreakerActive).toBe(true);
  });

  // ── Test 6: Daily reset lifts circuit breaker ─────────────────────────────

  it('should lift circuit breaker after daily reset', async () => {
    // Ensure circuit breaker is active
    await riskStateRepo.update(
      { userId: testUserId },
      { dailyLoss: 500, circuitBreakerActive: true },
    );

    // Trigger the midnight reset
    await riskManagerService.resetDailyLimits();

    const riskState = await riskStateRepo.findOne({
      where: { userId: testUserId },
    });

    expect(riskState?.circuitBreakerActive).toBe(false);
    expect(riskState?.dailyLoss).toBe(0);
  });
});