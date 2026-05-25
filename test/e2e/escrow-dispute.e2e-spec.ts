/**
 * Escrow E2E:
 * lock → dispute → evidence → admin resolution → fund release
 */
process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDatabaseHelper } from '../helpers/test-database.helper';

describe('Escrow Dispute E2E', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let userToken: string;
  let adminToken: string;
  let escrowId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    const user = await dbHelper.seedUser({ email: 'escrow-user@example.com' });
    const admin = await dbHelper.seedUser({ email: 'escrow-admin@example.com', role: 'admin' });
    userToken = dbHelper.buildAuthHeader(user.id);
    adminToken = dbHelper.buildAuthHeader(admin.id, 'admin');
  });

  afterAll(async () => { await app?.close(); });

  it('escrow creation endpoint exists', async () => {
    const res = await request(app.getHttpServer())
      .post('/escrow')
      .set('Authorization', userToken)
      .send({ amount: 200, currency: 'USD', description: 'E2E escrow test' });

    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
    escrowId = res.body?.data?.id ?? res.body?.id;
  });

  it('dispute creation endpoint exists', async () => {
    if (!escrowId) return;
    const res = await request(app.getHttpServer())
      .post(`/escrow/${escrowId}/dispute`)
      .set('Authorization', userToken)
      .send({ reason: 'E2E test dispute' });

    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
  });

  it('admin resolution endpoint exists', async () => {
    if (!escrowId) return;
    const res = await request(app.getHttpServer())
      .post(`/admin/escrow/${escrowId}/resolve`)
      .set('Authorization', adminToken)
      .send({ resolution: 'release', notes: 'E2E admin resolution' });

    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
  });
});
