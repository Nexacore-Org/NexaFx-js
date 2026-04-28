import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('FX History (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('returns OHLC history', async () => {
    const res = await request(app.getHttpServer())
      .get('/fx/rates/USD/NGN/history')
      .query({
        from: '2025-01-01',
        to: '2025-03-01',
        granularity: '1h',
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns current rates', async () => {
    const res = await request(app.getHttpServer())
      .get('/fx/rates');

    expect(res.status).toBe(200);
  });
});
