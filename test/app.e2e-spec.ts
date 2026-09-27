import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { setRequiredTestEnv } from './test-env';

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
    setRequiredTestEnv();

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
