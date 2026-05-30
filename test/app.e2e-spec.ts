import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'postgres';
    process.env.DB_NAME = 'nexafx_test';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret';
    process.env.OTP_SECRET = 'test-otp-secret';
    process.env.WALLET_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.WALLET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.BLOCKCHAIN_RPC_URL = 'http://localhost:8545';
    process.env.PROVIDER_API_URL = 'https://api.example.com';
    process.env.PROVIDER_API_KEY = 'test-provider-key';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'test';
    process.env.MAIL_FROM = 'test@example.com';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/cats (POST) - should return 400 when validation fails', () => {
    return request(app.getHttpServer())
      .post('/cats')
      .send({}) // empty body should fail validation
      .expect(400);
  });

  it('/cats (POST) - should return 400 when name is missing', () => {
    return request(app.getHttpServer())
      .post('/cats')
      .send({ breed: 'Siamese', age: 2 })
      .expect(400);
  });

  it('/cats (POST) - should return 201 when valid data is sent', () => {
    return request(app.getHttpServer())
      .post('/cats')
      .send({ name: 'Fluffy', breed: 'Persian', age: 3 })
      .expect(201);
  });
});
