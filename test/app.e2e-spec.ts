import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

describe('App e2e', () => {
  jest.setTimeout(20000);
  let app: INestApplication;
  const registrationPayload = {
    email: 'ada@example.com',
    password: 'correcthorsebatterystaple',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_BULL = 'true';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'postgres';
    process.env.DB_NAME = 'nexafx_test';
    process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars';
    process.env.REFRESH_TOKEN_SECRET =
      'test-refresh-secret-must-be-at-least-32';
    process.env.OTP_SECRET = 'test-otp-secret-must-be-at-least-32-chars';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'test-password';
    process.env.MAIL_FROM = 'test@example.com';

    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health returns 200', () => {
    return request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('POST /api/v1/auth/register returns 201 for a valid payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationPayload)
      .expect(201);

    expect(response.body).toHaveProperty('accessToken');
  });

  it('POST /api/v1/auth/login returns a JWT for valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationPayload.email,
        password: registrationPayload.password,
      })
      .expect(200);

    expect(response.body).toHaveProperty('accessToken');
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('rejects protected endpoints without a bearer token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/wallets/acct-1')
      .expect(401);
  });
});
