import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { CircuitBreakerService } from '../src/common/circuit-breaker/circuit-breaker.service';
import { CircuitBreakerController } from '../src/modules/health/controllers/circuit-breaker.controller';
import { AdminGuard } from '../src/modules/auth/guards/admin.guard';

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  keys: jest.fn().mockResolvedValue([]),
};

describe('Circuit Breaker (e2e)', () => {
  let app: INestApplication;
  let breakerService: CircuitBreakerService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CircuitBreakerController],
      providers: [
        { provide: CircuitBreakerService, useValue: new CircuitBreakerService(mockRedis as any) },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    breakerService = moduleFixture.get(CircuitBreakerService);
  });

  afterAll(() => app.close());

  describe('CircuitBreakerService', () => {
    it('allows execution when no state exists', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await breakerService.canExecute('test-circuit');
      expect(result).toBe(true);
    });

    it('opens after 5 consecutive failures', async () => {
      mockRedis.get.mockResolvedValue(null);
      for (let i = 0; i < 5; i++) {
        await breakerService.onFailure('test-circuit');
      }
      // After 5 failures, state should be OPEN
      const lastSetCall = mockRedis.set.mock.calls[mockRedis.set.mock.calls.length - 1];
      const state = JSON.parse(lastSetCall[1]);
      expect(state.state).toBe('OPEN');
    });

    it('returns false when circuit is OPEN', async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({ state: 'OPEN', failureCount: 5, lastFailureTime: Date.now() }),
      );
      const result = await breakerService.canExecute('test-circuit');
      expect(result).toBe(false);
    });

    it('closes on success', async () => {
      await breakerService.onSuccess('test-circuit');
      const lastSetCall = mockRedis.set.mock.calls[mockRedis.set.mock.calls.length - 1];
      const state = JSON.parse(lastSetCall[1]);
      expect(state.state).toBe('CLOSED');
    });

    it('manual open sets sticky override', async () => {
      await breakerService.manualOpen('test-circuit');
      const lastSetCall = mockRedis.set.mock.calls[mockRedis.set.mock.calls.length - 1];
      const state = JSON.parse(lastSetCall[1]);
      expect(state.manualOverride).toBe('OPEN');
    });
  });

  describe('GET /admin/circuit-breakers', () => {
    it('returns all circuit breaker states', async () => {
      mockRedis.keys.mockResolvedValueOnce(['circuit:fx-provider-a', 'circuit:payment-rail']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ state: 'CLOSED', failureCount: 0 }))
        .mockResolvedValueOnce(JSON.stringify({ state: 'OPEN', failureCount: 5 }));

      const res = await request(app.getHttpServer()).get('/admin/circuit-breakers');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /admin/circuit-breakers/:name/open', () => {
    it('manually opens a circuit breaker', async () => {
      const res = await request(app.getHttpServer()).post('/admin/circuit-breakers/fx-provider-a/open');
      expect(res.status).toBe(201);
      expect(res.body.message).toContain('fx-provider-a');
    });
  });
});
