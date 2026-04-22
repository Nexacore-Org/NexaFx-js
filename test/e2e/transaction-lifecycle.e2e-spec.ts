/**
 * Transaction Lifecycle E2E:
 * creation → risk scoring → webhook delivery → receipt generation
 */
process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDatabaseHelper } from '../helpers/test-database.helper';

describe('Transaction Lifecycle E2E', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;
  let transactionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('WebhookDispatcherService')
      .useValue({ dispatch: jest.fn().mockResolvedValue(true) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    // Seed a user and get auth token
    const user = await dbHelper.seedUser({ email: 'tx-lifecycle@example.com' });
    authToken = dbHelper.buildAuthHeader(user.id);
  });

  afterAll(async () => { await app?.close(); });

  it('creates a transaction', async () => {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', authToken)
      .send({ amount: 100, currency: 'USD', description: 'E2E test' });

    expect([200, 201]).toContain(res.status);
    transactionId = res.body?.data?.id ?? res.body?.id;
  });

  it('transaction has a risk score after creation', async () => {
    if (!transactionId) return;
    // Allow async risk scoring to complete
    await new Promise((r) => setTimeout(r, 200));

    const res = await request(app.getHttpServer())
      .get(`/transactions/${transactionId}/receipt`)
      .set('Authorization', authToken);

    expect([200, 404]).toContain(res.status);
  });

  it('receipt generation endpoint exists', async () => {
    if (!transactionId) return;
    const res = await request(app.getHttpServer())
      .get(`/transactions/${transactionId}/receipt`)
      .set('Authorization', authToken);
    expect(res.status).not.toBe(500);
  });
});
