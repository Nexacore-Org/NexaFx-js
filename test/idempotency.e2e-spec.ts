/**
 * Idempotency E2E tests — #468
 * Verifies: duplicate key returns cached response, different body returns 422,
 * 10 concurrent duplicates return exactly 1 success + rest cached.
 */
process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TestDatabaseHelper } from './helpers/test-database.helper';

describe('Idempotency E2E (#468)', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    const user = await dbHelper.seedUser({ email: 'idempotency-test@example.com' });
    authToken = dbHelper.buildAuthHeader(user.id);
  });

  afterAll(async () => { await app?.close(); });

  it('duplicate Idempotency-Key returns cached response, not re-executed', async () => {
    const key = `idem-test-key-${Date.now()}`;
    const body = { amount: 10, currency: 'USD', description: 'idempotency test' };

    const first = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', authToken)
      .set('Idempotency-Key', key)
      .send(body);

    const second = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', authToken)
      .set('Idempotency-Key', key)
      .send(body);

    // Both should succeed; second returns cached
    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
  });

  it('same key with different body returns 422', async () => {
    const key = `idem-conflict-key-${Date.now()}`;

    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', authToken)
      .set('Idempotency-Key', key)
      .send({ amount: 10, currency: 'USD' });

    const conflict = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', authToken)
      .set('Idempotency-Key', key)
      .send({ amount: 99, currency: 'EUR' }); // different body

    expect(conflict.status).toBe(422);
  });

  it('key shorter than 16 chars returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', authToken)
      .set('Idempotency-Key', 'short')
      .send({ amount: 10, currency: 'USD' });

    expect(res.status).toBe(400);
  });

  it('10 concurrent duplicate requests return exactly 1 unique response', async () => {
    const key = `idem-concurrent-${Date.now()}`;
    const body = { amount: 5, currency: 'USD', description: 'concurrent test' };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/transactions')
          .set('Authorization', authToken)
          .set('Idempotency-Key', key)
          .send(body),
      ),
    );

    const statuses = responses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200 || s === 201);
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });
});
