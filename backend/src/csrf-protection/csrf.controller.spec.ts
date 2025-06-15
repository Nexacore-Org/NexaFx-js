import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { CsrfModule } from './csrf.module';

describe('CSRF Protection (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CsrfModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should provide CSRF token', () => {
    return request(app.getHttpServer())
      .get('/csrf/token')
      .expect(200)
      .expect(response => {
        expect(response.body.csrfToken).toBeDefined();
        expect(typeof response.body.csrfToken).toBe('string');
      });
  });

  it('should reject requests without CSRF token', async () => {
    return request(app.getHttpServer())
      .post('/api/protected')
      .send({ data: 'test' })
      .expect(403);
  });

  it('should accept requests with valid CSRF token', async () => {
    // Get token first
    const tokenResponse = await request(app.getHttpServer())
      .get('/api/csrf-token');
    
    const { csrfToken, sessionId } = tokenResponse.body;

    // Use token in protected request
    return request(app.getHttpServer())
      .post('/api/protected')
      .set('X-CSRF-Token', csrfToken)
      .set('X-Session-ID', sessionId)
      .send({ data: 'test' })
      .expect(201);
  });

  afterEach(async () => {
    await app.close();
  });
});