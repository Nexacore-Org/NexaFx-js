import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EmailVerifyModule } from './email-verify.module';

describe('EmailVerifyController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EmailVerifyModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/email/resend (POST) should allow 3 requests then limit', async () => {
    const email = 'test@example.com';
    
    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/auth/email/resend')
        .send({ email })
        .expect(200);
    }
    
    // 4th request should be rate limited
    await request(app.getHttpServer())
      .post('/auth/email/resend')
      .send({ email })
      .expect(429);
  });
});