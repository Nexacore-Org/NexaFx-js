import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskEngineModule } from '../src/modules/risk-engine/risk-engine.module';
import { RiskState } from '../src/modules/risk-engine/entities/risk-state.entity';
import { RiskPosition } from '../src/modules/risk-engine/entities/risk-position.entity';
import { RiskSnapshot } from '../src/modules/risk-engine/entities/risk-snapshot.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('RiskEngine (e2e)', () => {
  let app: INestApplication;
  let riskStateRepo: Repository<RiskState>;
  let positionRepo: Repository<RiskPosition>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [RiskState, RiskPosition, RiskSnapshot],
          synchronize: true,
        }),
        RiskEngineModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    riskStateRepo = moduleFixture.get<Repository<RiskState>>(
      getRepositoryToken(RiskState),
    );
    positionRepo = moduleFixture.get<Repository<RiskPosition>>(
      getRepositoryToken(RiskPosition),
    );
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const userId = 'user-123';

  it('should create initial risk state', async () => {
    // Manually create risk state or use update endpoint to auto-create
    await request(app.getHttpServer())
      .post(`/risk/refresh/${userId}`)
      .expect(201); // 201 Created

    const state = await riskStateRepo.findOne({ where: { userId } });
    if (!state) throw new Error('Risk state not found');
    expect(Number(state.totalEquity)).toBe(0);
  });

  it('should update risk metrics with positions', async () => {
    // Seed positions directly
    const state = await riskStateRepo.findOne({ where: { userId } });
    if (!state) throw new Error('Risk state not found');

    // Update equity first
    state.totalEquity = 10000;
    await riskStateRepo.save(state);

    await positionRepo.save([
      {
        userId,
        symbol: 'EURUSD',
        quantity: 10000,
        entryPrice: 1.1,
        currentPrice: 1.105,
        leverage: 10,
        side: 'BUY',
        assetType: 'FOREX',
        riskState: state,
      },
      {
        userId,
        symbol: 'BTCUSD',
        quantity: 0.1,
        entryPrice: 50000,
        currentPrice: 48000,
        leverage: 2,
        side: 'BUY',
        assetType: 'CRYPTO',
        riskState: state,
      },
    ] as any[]);

    // Trigger update
    const response = await request(app.getHttpServer())
      .post(`/risk/refresh/${userId}`)
      .expect(201);

    expect(Number(response.body.usedMargin)).toBeGreaterThan(0);
    // EURUSD Margin: (10000 * 1.1050) / 10 = 1105
    // BTCUSD Margin: (0.1 * 48000) / 2 = 2400
    // Total Margin ~= 3505
    const margin = Number(response.body.usedMargin);
    expect(margin).toBeCloseTo(3505, 0);
  });

  it('should run stress tests', async () => {
    const response = await request(app.getHttpServer())
      .post(`/risk/stress-test/${userId}`)
      .expect(201);

    expect(response.body['Flash Crash -10%']).toBeDefined();
    expect(response.body['Flash Crash -10%'].isLiquidated).toBeDefined();
  });

  it('should block risky trades', async () => {
    // Set strict limits
    await request(app.getHttpServer())
      .put(`/risk/limits/${userId}`)
      .send({ maxLeverage: 5 }) // Current EURUSD leverage is 10, so new trade with high leverage should be blocked?
      // Wait, checkTrade checks the NEW trade leverage, and projected portfolio leverage.
      .expect(200);

    // Attempt trade with high leverage
    const riskyTrade = {
      userId,
      symbol: 'ETHUSD',
      quantity: 10,
      price: 3000,
      side: 'BUY',
      leverage: 20, // Exceeds maxLeverage 5
      assetType: 'CRYPTO',
    };

    const response = await request(app.getHttpServer())
      .post('/risk/check-trade')
      .send(riskyTrade)
      .expect(201); // Controller returns result, status 201 default for POST

    expect(response.body.isAllowed).toBe(false);
    expect(response.body.reason).toContain('exceeds limit');
  });

  it('should allow safe trades', async () => {
    const safeTrade = {
      userId,
      symbol: 'ETHUSD',
      quantity: 0.1,
      price: 3000,
      side: 'BUY',
      leverage: 2,
      assetType: 'CRYPTO',
    };

    const response = await request(app.getHttpServer())
      .post('/risk/check-trade')
      .send(safeTrade)
      .expect(201);

    expect(response.body.isAllowed).toBe(true);
  });
});
