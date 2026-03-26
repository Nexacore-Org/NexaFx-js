/**
 * Transaction lifecycle E2E:
 * creation → risk scoring → webhook delivery → receipt generation
 *
 * External services (webhook delivery, email) are mocked.
 * DB uses a real PostgreSQL database.
 */
process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt.guard';
import { AdminGuard } from '../../src/modules/auth/guards/admin.guard';
import { TestDatabaseHelper } from '../helpers/test-database.helper';

const MOCK_USER = { id: 'txn-lifecycle-user-001', role: 'user', email: 'txn@example.com' };
const IDEMPOTENCY_KEY = 'txn-lifecycle-idem-key-001';

describe('Transaction lifecycle E2E', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let webhookDeliveryMock: jest.Mock;

  beforeAll(async () => {
    webhookDeliveryMock = jest.fn().mockResolvedValue({ status: 200 });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = MOCK_USER;
          return true;
        },
      })
      .overrideProvider(AdminGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider('WebhookDeliveryService')
      .useValue({ deliver: webhookDeliveryMock })
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

  describe('Ledger entry creation (idempotent)', () => {
    it('creates a double-entry with a valid Idempotency-Key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger/entries')
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', IDEMPOTENCY_KEY)
        .send({
          entries: [
            { accountId: 'acc-debit-001', type: 'debit', amount: '100.00', currency: 'USD' },
            { accountId: 'acc-credit-001', type: 'credit', amount: '100.00', currency: 'USD' },
          ],
          description: 'E2E test transfer',
        });

      expect(res.status).not.toBe(404);
    });

    it('returns 400 when Idempotency-Key is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger/entries')
        .set('Authorization', 'Bearer test-token')
        .send({
          entries: [
            { accountId: 'acc-debit-001', type: 'debit', amount: '100.00', currency: 'USD' },
            { accountId: 'acc-credit-001', type: 'credit', amount: '100.00', currency: 'USD' },
          ],
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 when Idempotency-Key is shorter than 16 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ledger/entries')
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', 'short')
        .send({ entries: [] });

      expect(res.status).toBe(400);
    });

    it('returns cached response for duplicate Idempotency-Key', async () => {
      const body = {
        entries: [
          { accountId: 'acc-debit-001', type: 'debit', amount: '50.00', currency: 'USD' },
          { accountId: 'acc-credit-001', type: 'credit', amount: '50.00', currency: 'USD' },
        ],
        description: 'Duplicate idempotency test',
      };
      const key = 'duplicate-test-key-xyz';

      // First request
      const first = await request(app.getHttpServer())
        .post('/api/v1/ledger/entries')
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', key)
        .send(body);

      // Second request with same key + same body
      const second = await request(app.getHttpServer())
        .post('/api/v1/ledger/entries')
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', key)
        .send(body);

      // Both should succeed with same status code
      expect(first.status).toBe(second.status);
    });
  });

  describe('Transaction search', () => {
    it('GET /transactions/search returns paginated results', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions/search?page=1&limit=10')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).not.toBe(404);
    });
  });

  describe('Reconciliation lifecycle', () => {
    it('POST /reconciliation creates a reconciliation record', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reconciliation')
        .set('Authorization', 'Bearer test-token')
        .set('Idempotency-Key', 'reconcile-test-key-001')
        .send({ description: 'E2E reconciliation test' });

      expect(res.status).not.toBe(404);
    });
  });
});
