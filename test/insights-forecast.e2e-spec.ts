import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InsightsForecastModule } from '../src/modules/insights/insights-forecast.module';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { Goal } from '../src/goals/entities/goal.entity';
import { WalletEntity } from '../src/modules/users/entities/wallet.entity';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';

const mockUser = { id: 'user-1', sub: 'user-1', role: 'user' };

const mockTxRepo = {
  find: jest.fn().mockResolvedValue([]),
};
const mockGoalRepo = { findOne: jest.fn() };
const mockWalletRepo = { findOne: jest.fn() };

describe('Insights & Forecast (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [InsightsForecastModule],
    })
      .overrideProvider(getRepositoryToken(TransactionEntity))
      .useValue(mockTxRepo)
      .overrideProvider(getRepositoryToken(Goal))
      .useValue(mockGoalRepo)
      .overrideProvider(getRepositoryToken(WalletEntity))
      .useValue(mockWalletRepo)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => { ctx.switchToHttp().getRequest().user = mockUser; return true; } })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  describe('GET /insights/spending', () => {
    it('returns empty insights when no transactions', async () => {
      mockTxRepo.find.mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/insights/spending');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('insights');
      expect(res.body).toHaveProperty('budgetSuggestions');
      expect(Array.isArray(res.body.insights)).toBe(true);
    });

    it('returns top categories with spike detection', async () => {
      const now = new Date();
      const txs = [
        { userId: 'user-1', category: 'food', amount: 500, createdAt: now, currency: 'USD' },
        { userId: 'user-1', category: 'food', amount: 300, createdAt: now, currency: 'USD' },
        { userId: 'user-1', category: 'transport', amount: 200, createdAt: now, currency: 'USD' },
      ];
      mockTxRepo.find.mockResolvedValueOnce(txs).mockResolvedValueOnce([]).mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/insights/spending?period=MONTHLY');
      expect(res.status).toBe(200);
      expect(res.body.insights.length).toBeGreaterThan(0);
      expect(res.body.insights[0]).toHaveProperty('category');
      expect(res.body.insights[0]).toHaveProperty('unusualSpike');
    });
  });

  describe('GET /wallets/:id/forecast', () => {
    it('returns 404 when wallet not found', async () => {
      mockWalletRepo.findOne.mockResolvedValue(null);
      const res = await request(app.getHttpServer()).get('/wallets/nonexistent/forecast');
      expect(res.status).toBe(404);
    });

    it('returns forecast for existing wallet', async () => {
      mockWalletRepo.findOne.mockResolvedValue({ id: 'w1', availableBalance: 1000 });
      mockTxRepo.find.mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/wallets/w1/forecast');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('forecast');
      expect(res.body.forecast).toHaveProperty('days30');
      expect(res.body.forecast).toHaveProperty('days60');
      expect(res.body.forecast).toHaveProperty('days90');
    });
  });

  describe('GET /insights/cashflow', () => {
    it('returns upcoming transactions', async () => {
      mockTxRepo.find.mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/insights/cashflow?walletId=w1');
      expect(res.status).toBe(200);
    });
  });
});
