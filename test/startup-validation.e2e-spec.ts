import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ConfigModule } from '../src/config/config.module';
import { validateEnv } from '../src/config/env.validation';

describe('Startup Validation - Integration Tests', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.resetModules();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should fail to start with invalid JWT_SECRET (too short)', async () => {
    process.env.JWT_SECRET = 'short';
    process.env.REFRESH_TOKEN_SECRET = 'very-long-refresh-token-secret-for-testing';
    process.env.OTP_SECRET = 'very-long-otp-secret-for-testing';
    process.env.WALLET_ENCRYPTION_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'https://api.example.com';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    await expect(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    }).rejects.toThrow(/Environment validation failed/);
  });

  it('should fail to start with invalid REFRESH_TOKEN_SECRET (too short)', async () => {
    process.env.JWT_SECRET = 'very-long-jwt-secret-for-testing-with-minimum-length';
    process.env.REFRESH_TOKEN_SECRET = 'short';
    process.env.OTP_SECRET = 'very-long-otp-secret-for-testing';
    process.env.WALLET_ENCRYPTION_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'https://api.example.com';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    await expect(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    }).rejects.toThrow(/Environment validation failed/);
  });

  it('should fail to start with invalid OTP_SECRET (too short)', async () => {
    process.env.JWT_SECRET = 'very-long-jwt-secret-for-testing-with-minimum-length';
    process.env.REFRESH_TOKEN_SECRET = 'very-long-refresh-token-secret-for-testing';
    process.env.OTP_SECRET = 'short';
    process.env.WALLET_ENCRYPTION_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'https://api.example.com';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    await expect(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    }).rejects.toThrow(/Environment validation failed/);
  });

  it('should fail to start with invalid WALLET_ENCRYPTION_KEY (wrong length)', async () => {
    process.env.JWT_SECRET = 'very-long-jwt-secret-for-testing-with-minimum-length';
    process.env.REFRESH_TOKEN_SECRET = 'very-long-refresh-token-secret-for-testing';
    process.env.OTP_SECRET = 'very-long-otp-secret-for-testing';
    process.env.WALLET_ENCRYPTION_KEY = 'invalid-length-key';
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'https://api.example.com';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    await expect(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    }).rejects.toThrow(/Environment validation failed/);
  });

  it('should fail to start with invalid WALLET_ENCRYPTION_KEY (non-hex)', async () => {
    process.env.JWT_SECRET = 'very-long-jwt-secret-for-testing-with-minimum-length';
    process.env.REFRESH_TOKEN_SECRET = 'very-long-refresh-token-secret-for-testing';
    process.env.OTP_SECRET = 'very-long-otp-secret-for-testing';
    process.env.WALLET_ENCRYPTION_KEY = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'; // Contains non-hex characters
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'https://api.example.com';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    await expect(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    }).rejects.toThrow(/Environment validation failed/);
  });

  it('should fail to start with invalid EXTERNAL_API_URL', async () => {
    process.env.JWT_SECRET = 'very-long-jwt-secret-for-testing-with-minimum-length';
    process.env.REFRESH_TOKEN_SECRET = 'very-long-refresh-token-secret-for-testing';
    process.env.OTP_SECRET = 'very-long-otp-secret-for-testing';
    process.env.WALLET_ENCRYPTION_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'invalid-url';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    await expect(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    }).rejects.toThrow(/Environment validation failed/);
  });

  it('should fail to start with missing required DB_HOST', async () => {
    process.env.JWT_SECRET = 'very-long-jwt-secret-for-testing-with-minimum-length';
    process.env.REFRESH_TOKEN_SECRET = 'very-long-refresh-token-secret-for-testing';
    process.env.OTP_SECRET = 'very-long-otp-secret-for-testing';
    process.env.WALLET_ENCRYPTION_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'https://api.example.com';
    delete process.env.DB_HOST; // Missing required value
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    await expect(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    }).rejects.toThrow(/Environment validation failed/);
  });

  it('should successfully start with valid configuration', async () => {
    process.env.JWT_SECRET = 'very-long-jwt-secret-for-testing-with-minimum-length';
    process.env.REFRESH_TOKEN_SECRET = 'very-long-refresh-token-secret-for-testing';
    process.env.OTP_SECRET = 'very-long-otp-secret-for-testing';
    process.env.WALLET_ENCRYPTION_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
    process.env.EXTERNAL_API_KEY = 'test-api-key';
    process.env.EXTERNAL_API_URL = 'https://api.example.com';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.DB_NAME = 'testdb';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'password';
    process.env.MAIL_FROM = 'noreply@example.com';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await expect(app.init()).resolves.not.toThrow();
  });

  it('should validate environment variables directly using validation schema', () => {
    const validEnv = {
      NODE_ENV: 'test',
      PORT: '3000',
      BODY_LIMIT_JSON: '10',
      BODY_LIMIT_URLENCODED: '10',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USER: 'testuser',
      DB_PASSWORD: 'testpass',
      DB_NAME: 'testdb',
      DB_SSL: 'false',
      JWT_SECRET: 'very-long-jwt-secret-for-testing-with-minimum-length',
      JWT_EXPIRY: '3600',
      REFRESH_TOKEN_SECRET: 'very-long-refresh-token-secret-for-testing',
      REFRESH_TOKEN_EXPIRY: '604800',
      OTP_SECRET: 'very-long-otp-secret-for-testing',
      OTP_EXPIRY: '300',
      WALLET_ENCRYPTION_KEY: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      EXTERNAL_API_KEY: 'test-api-key',
      EXTERNAL_API_URL: 'https://api.example.com',
      EXTERNAL_API_TIMEOUT: '30000',
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USER: 'test@example.com',
      MAIL_PASSWORD: 'password',
      MAIL_FROM: 'noreply@example.com',
      MAIL_SECURE: 'false',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_MAX_REQUESTS: '100',
    };

    expect(() => validateEnv(validEnv)).not.toThrow();
  });

  it('should fail validation with invalid environment variables', () => {
    const invalidEnv = {
      NODE_ENV: 'test',
      PORT: '3000',
      BODY_LIMIT_JSON: '10',
      BODY_LIMIT_URLENCODED: '10',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USER: 'testuser',
      DB_PASSWORD: 'testpass',
      DB_NAME: 'testdb',
      DB_SSL: 'false',
      JWT_SECRET: 'short', // Too short
      JWT_EXPIRY: '3600',
      REFRESH_TOKEN_SECRET: 'very-long-refresh-token-secret-for-testing',
      REFRESH_TOKEN_EXPIRY: '604800',
      OTP_SECRET: 'very-long-otp-secret-for-testing',
      OTP_EXPIRY: '300',
      WALLET_ENCRYPTION_KEY: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      EXTERNAL_API_KEY: 'test-api-key',
      EXTERNAL_API_URL: 'https://api.example.com',
      EXTERNAL_API_TIMEOUT: '30000',
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USER: 'test@example.com',
      MAIL_PASSWORD: 'password',
      MAIL_FROM: 'noreply@example.com',
      MAIL_SECURE: 'false',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_MAX_REQUESTS: '100',
    };

    expect(() => validateEnv(invalidEnv)).toThrow(/Environment validation failed/);
  });
});