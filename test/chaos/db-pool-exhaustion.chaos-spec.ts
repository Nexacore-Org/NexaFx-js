/**
 * Chaos Test: DB Connection Pool Exhaustion — #466
 * Verifies requests queue and degrade gracefully — no unhandled exceptions.
 * Run with: CHAOS=true npx jest test/chaos/db-pool-exhaustion.chaos-spec.ts
 */
if (!process.env.CHAOS) {
  describe.skip('DB Pool Exhaustion Chaos (skipped — set CHAOS=true to enable)', () => { it('skipped', () => {}); });
} else {

process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TestDatabaseHelper } from '../helpers/test-database.helper';

describe('Chaos: DB Pool Exhaustion', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    const user = await dbHelper.seedUser({ email: 'chaos-db@example.com' });
    authToken = dbHelper.buildAuthHeader(user.id);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // Cleanup: release any held connections
    try { await dataSource.query('SELECT 1'); } catch (_) {}
    await app?.close();
  });

  it('concurrent requests under pool pressure do not throw unhandled exceptions', async () => {
    // Fire 20 concurrent requests to exhaust a small pool
    const responses = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .get('/wallets/portfolio')
          .set('Authorization', authToken),
      ),
    );

    const statuses = responses
      .filter((r) => r.status === 'fulfilled')
      .map((r: any) => r.value.status);

    // No 500s — requests should queue or return 503, never crash
    const serverErrors = statuses.filter((s) => s === 500);
    expect(serverErrors.length).toBe(0);
  });
});

} // end CHAOS guard
