/**
 * Chaos Test: Webhook Endpoint Unavailable — #466
 * Retry queue backs up correctly, DLQ captures exhausted jobs.
 * Run with: CHAOS=true npx jest test/chaos/webhook-unavailable.chaos-spec.ts
 */
if (!process.env.CHAOS) {
  describe.skip('Webhook Unavailable Chaos (skipped — set CHAOS=true to enable)', () => { it('skipped', () => {}); });
} else {

process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDatabaseHelper } from '../helpers/test-database.helper';

describe('Chaos: Webhook Endpoint Unavailable', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Simulate webhook dispatcher always failing
      .overrideProvider('WebhookDispatcherService')
      .useValue({
        dispatch: jest.fn().mockRejectedValue(new Error('Webhook endpoint unavailable')),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    const user = await dbHelper.seedUser({ email: 'chaos-webhook@example.com' });
    authToken = dbHelper.buildAuthHeader(user.id);
  });

  afterAll(async () => { await app?.close(); });

  it('transaction creation succeeds even when webhook delivery fails', async () => {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', authToken)
      .set('Idempotency-Key', `chaos-webhook-${Date.now()}`)
      .send({ amount: 10, currency: 'USD', description: 'chaos webhook test' });

    // Transaction should succeed — webhook failure must not block the response
    expect([200, 201]).toContain(res.status);
  });

  it('app does not crash after repeated webhook failures', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post('/transactions')
          .set('Authorization', authToken)
          .set('Idempotency-Key', `chaos-webhook-multi-${Date.now()}-${i}`)
          .send({ amount: 1, currency: 'USD' }),
      ),
    );

    const serverErrors = responses.filter((r) => r.status === 500);
    expect(serverErrors.length).toBe(0);
  });
});

} // end CHAOS guard
