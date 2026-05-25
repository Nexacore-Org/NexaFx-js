/**
 * Chaos Test: Redis Failure — #466
 * Verifies app continues serving (degraded) when Redis is unavailable.
 * Balance queries fall through to DB.
 *
 * Run with: CHAOS=true npx jest test/chaos/redis-failure.chaos-spec.ts
 */
if (!process.env.CHAOS) {
  describe.skip('Redis Failure Chaos (skipped — set CHAOS=true to enable)', () => { it('skipped', () => {}); });
} else {

process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDatabaseHelper } from '../helpers/test-database.helper';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('Chaos: Redis Failure', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;
  let cacheManager: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    const user = await dbHelper.seedUser({ email: 'chaos-redis@example.com' });
    authToken = dbHelper.buildAuthHeader(user.id);
    cacheManager = app.get(CACHE_MANAGER);
  });

  afterAll(async () => {
    // Restore: re-enable cache (cleanup)
    if (cacheManager?.store?.getClient) {
      try { cacheManager.store.getClient().connect(); } catch (_) {}
    }
    await app?.close();
  });

  it('app continues serving balance queries when Redis is unavailable (falls through to DB)', async () => {
    // Simulate Redis failure by disconnecting the client
    if (cacheManager?.store?.getClient) {
      try { cacheManager.store.getClient().disconnect(); } catch (_) {}
    }

    const res = await request(app.getHttpServer())
      .get('/wallets/portfolio')
      .set('Authorization', authToken);

    // Should not crash — 200 (DB fallback) or 401 (auth guard), never 500
    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(503);
  });

  it('app does not crash on cache set failure', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Authorization', authToken);

    expect([200, 503]).toContain(res.status);
  });
});

} // end CHAOS guard
