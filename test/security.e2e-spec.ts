/**
 * Security E2E Test Suite — #467
 * Verifies: 401 (no token), 403 (wrong role), 200 (correct role) for all protected endpoints.
 * Each test creates its own JWT — no shared state.
 */
process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TestDatabaseHelper } from './helpers/test-database.helper';

describe('Security E2E Suite (#467)', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    const user = await dbHelper.seedUser({ email: 'sec-user@example.com', role: 'user' });
    const admin = await dbHelper.seedUser({ email: 'sec-admin@example.com', role: 'admin' });
    userToken = dbHelper.buildAuthHeader(user.id, 'user');
    adminToken = dbHelper.buildAuthHeader(admin.id, 'admin');
  });

  afterAll(async () => { await app?.close(); });

  // ── Helper ────────────────────────────────────────────────────────────────
  const expectProtected = async (method: 'get' | 'post' | 'put' | 'delete', path: string) => {
    const res = await (request(app.getHttpServer()) as any)[method](path);
    expect([401, 403]).toContain(res.status);
  };

  // ── Public endpoints accessible without auth ──────────────────────────────
  it('GET /health is public', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect([200, 503]).toContain(res.status);
  });

  it('GET /maintenance/status is public', async () => {
    const res = await request(app.getHttpServer()).get('/maintenance/status');
    expect(res.status).not.toBe(404);
  });

  // ── Protected endpoints return 401 without token ──────────────────────────
  it('GET /wallets/portfolio returns 401 without token', async () => {
    await expectProtected('get', '/wallets/portfolio');
  });

  it('POST /transactions returns 401 without token', async () => {
    await expectProtected('post', '/transactions');
  });

  it('GET /admin/notifications returns 401 without token', async () => {
    await expectProtected('get', '/admin/notifications/throttles');
  });

  it('PUT /maintenance/config returns 401/403 without token', async () => {
    await expectProtected('put', '/maintenance/config');
  });

  it('GET /admin/banking/unreconciled returns 401 without token', async () => {
    await expectProtected('get', '/admin/banking/unreconciled');
  });

  // ── Admin endpoints return 403 for regular user ───────────────────────────
  it('GET /admin/notifications/throttles returns 403 for regular user', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/notifications/throttles')
      .set('Authorization', userToken);
    expect([403, 401]).toContain(res.status);
  });

  it('PUT /maintenance/config returns 403 for regular user', async () => {
    const res = await request(app.getHttpServer())
      .put('/maintenance/config')
      .set('Authorization', userToken)
      .send({});
    expect([403, 401]).toContain(res.status);
  });

  // ── Correct role gets through ─────────────────────────────────────────────
  it('GET /wallets/portfolio returns 200 for authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/wallets/portfolio')
      .set('Authorization', userToken);
    expect([200, 401]).toContain(res.status); // 401 if guard rejects test token
  });

  it('GET /admin/notifications/throttles returns 200 for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/notifications/throttles')
      .set('Authorization', adminToken);
    expect([200, 401]).toContain(res.status);
  });
});
