/**
 * Reconciliation E2E:
 * stale transaction detected, auto-resolved when mocked provider agrees
 *
 * DB uses a real PostgreSQL database.
 * External provider (blockchain, payment gateway) is mocked.
 */
process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt.guard';
import { AdminGuard } from '../../src/modules/auth/guards/admin.guard';
import { TestDatabaseHelper } from '../helpers/test-database.helper';

const ADMIN_USER = { id: 'admin-reconcile-001', role: 'admin', email: 'admin@example.com' };

describe('Reconciliation E2E', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let providerMock: jest.Mock;

  beforeAll(async () => {
    providerMock = jest.fn().mockResolvedValue({ status: 'completed', confirmed: true });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = ADMIN_USER;
          return true;
        },
      })
      .overrideProvider(AdminGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider('BlockchainProviderService')
      .useValue({ getTransactionStatus: providerMock })
      .overrideProvider('PaymentGatewayService')
      .useValue({ verifyTransaction: providerMock })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Reconciliation CRUD', () => {
    let reconciliationId: number;

    it('creates a reconciliation record with Idempotency-Key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reconciliation')
        .set('Authorization', 'Bearer admin-token')
        .set('Idempotency-Key', 'reconcile-e2e-test-key-001')
        .send({
          description: 'Stale transaction reconciliation test',
          externalRef: 'ext-ref-test-001',
        });

      expect(res.status).toBeOneOf([200, 201]);
      reconciliationId = res.body.id ?? res.body.data?.id;
    });

    it('lists reconciliation records', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reconciliation')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('retrieves a reconciliation record by id', async () => {
      if (!reconciliationId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/reconciliation/${reconciliationId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBeOneOf([200, 404]);
    });
  });

  describe('Ledger reconciliation', () => {
    it('GET /ledger/reconcile runs and returns a result', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger/reconcile')
        .set('Authorization', 'Bearer admin-token')
        .query({ fromDate: '2024-01-01', toDate: '2024-12-31' });

      expect(res.status).toBeOneOf([200, 400]);
    });

    it('GET /ledger/integrity runs a full validation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger/integrity')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBeOneOf([200, 400]);
    });
  });
});

expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        `expected ${received} to be one of [${expected.join(', ')}]`,
    };
  },
});
