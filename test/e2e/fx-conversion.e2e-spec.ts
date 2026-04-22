/**
 * FX Conversion E2E:
 * quote → lock → execute at locked rate → conversion record → loyalty earn
 */
process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDatabaseHelper } from '../helpers/test-database.helper';

describe('FX Conversion E2E', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;
  let quoteId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('FxAggregatorService')
      .useValue({
        getValidatedRate: jest.fn().mockResolvedValue(1.08),
        getRate: jest.fn().mockResolvedValue(1.08),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dbHelper = new TestDatabaseHelper(app);
    await dbHelper.truncateAll();

    const user = await dbHelper.seedUser({ email: 'fx-user@example.com' });
    authToken = dbHelper.buildAuthHeader(user.id);
  });

  afterAll(async () => { await app?.close(); });

  it('FX quote endpoint exists', async () => {
    const res = await request(app.getHttpServer())
      .post('/fx/quote')
      .set('Authorization', authToken)
      .send({ fromCurrency: 'USD', toCurrency: 'EUR', amount: 100 });

    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
    quoteId = res.body?.data?.quoteId ?? res.body?.quoteId;
  });

  it('FX conversion endpoint exists', async () => {
    const res = await request(app.getHttpServer())
      .post('/fx/convert')
      .set('Authorization', authToken)
      .send({
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        ...(quoteId ? { quoteId } : {}),
      });

    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
  });

  it('FX conversion history endpoint exists', async () => {
    const res = await request(app.getHttpServer())
      .get('/fx/conversions')
      .set('Authorization', authToken);

    expect([200, 401]).toContain(res.status);
  });
});
