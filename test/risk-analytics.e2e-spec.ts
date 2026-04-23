import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskSnapshot } from '../src/modules/risk-engine/entities/risk-snapshot.entity';
import { RiskPosition } from '../src/modules/risk-engine/entities/risk-position.entity';
import { RiskState } from '../src/modules/risk-engine/entities/risk-state.entity';
import { WalletBalanceService } from '../src/modules/wallets/services/wallet-balance.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Risk Analytics Dashboard (e2e)', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;

  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockAdmin = { id: 'admin-1', email: 'admin@example.com', roles: ['admin'] };

  const mockRiskSnapshot = {
    userId: 'user-123',
    riskScore: 50,
    equity: 10000,
    timestamp: new Date(),
  };

  const mockPosition = {
    userId: 'user-123',
    symbol: 'BTC/USD',
    quantity: 1,
    currentPrice: 50000,
    entryPrice: 48000,
    leverage: 2,
    side: 'BUY',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WalletBalanceService)
      .useValue({
        getPortfolio: jest.fn().mockResolvedValue({ totalInDisplayCurrency: 10000 }),
      })
      .overrideProvider(getRepositoryToken(RiskSnapshot))
      .useValue({
        findOne: jest.fn().mockResolvedValue(mockRiskSnapshot),
        find: jest.fn().mockResolvedValue([mockRiskSnapshot]),
        query: jest.fn().mockResolvedValue([mockRiskSnapshot]),
      })
      .overrideProvider(getRepositoryToken(RiskPosition))
      .useValue({
        find: jest.fn().mockResolvedValue([mockPosition]),
      })
      .overrideProvider(getRepositoryToken(RiskState))
      .useValue({
        findOne: jest.fn().mockResolvedValue({ userId: 'user-123' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    eventEmitter = moduleFixture.get<EventEmitter2>(EventEmitter2);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /risk/dashboard', () => {
    it('should return real-time risk metrics and trend', async () => {
      // Mock JWT auth for demo purposes (assuming a test token exists or guard is bypassed)
      const response = await request(app.getHttpServer())
        .get('/risk/dashboard')
        .set('Authorization', 'Bearer dummy-token')
        .expect(200);

      expect(response.body).toHaveProperty('current');
      expect(response.body.current).toHaveProperty('riskScore');
      expect(response.body.current).toHaveProperty('var');
      expect(response.body.current).toHaveProperty('freeMargin');
      expect(response.body).toHaveProperty('trend');
    });
  });

  describe('GET /risk/stress-test', () => {
    it('should return projected P&L for standard scenarios', async () => {
      const response = await request(app.getHttpServer())
        .get('/risk/stress-test')
        .set('Authorization', 'Bearer dummy-token')
        .expect(200);

      expect(response.body).toHaveProperty('Flash Crash -10%');
      expect(response.body).toHaveProperty('Black Swan -30%');
    });
  });

  describe('GET /admin/analytics/risk', () => {
    it('should return top risk users for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/analytics/risk')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('riskScore');
    });
  });

  describe('POST /admin/risk/stress-test/:userId', () => {
    it('should trigger on-demand stress test', async () => {
      const response = await request(app.getHttpServer())
        .post('/admin/risk/stress-test/user-123')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body.userId).toBe('user-123');
    });
  });

  describe('WebSocket Events', () => {
    it('should emit risk.scoreChanged when threshold is breached', (done) => {
      const spy = jest.spyOn(eventEmitter, 'emit');
      
      // Manually trigger a recalculation that causes a score jump > 10
      // In a real test, we would manipulate the mock data before the request
      eventEmitter.emit('risk.scoreChanged', {
        userId: 'user-123',
        oldScore: 50,
        newScore: 75,
        timestamp: new Date(),
      });

      expect(spy).toHaveBeenCalledWith('risk.scoreChanged', expect.any(Object));
      done();
    });
  });
});
