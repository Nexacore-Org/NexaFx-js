import configuration from './configuration';

describe('configuration factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PORT: '4001',
      BODY_LIMIT_JSON: '12',
      BODY_LIMIT_URLENCODED: '13',
      DB_HOST: 'db.example.com',
      DB_PORT: '5433',
      DB_USER: 'nexa',
      DB_PASSWORD: 'secret',
      DB_NAME: 'nexafx_prod',
      JWT_SECRET: 'a'.repeat(32),
      REFRESH_TOKEN_SECRET: 'b'.repeat(32),
      OTP_SECRET: 'c'.repeat(32),
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USER: 'mailer@example.com',
      MAIL_PASSWORD: 'secret',
      MAIL_FROM: 'noreply@example.com',
      REDIS_HOST: 'redis.example.com',
      REDIS_PORT: '6380',
      WALLET_ENCRYPTION_KEY: 'd'.repeat(64),
      ARCHIVE_ENABLED: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('builds grouped config values from the environment', () => {
    const config = configuration();

    expect(config.app).toEqual({
      nodeEnv: 'production',
      port: 4001,
      isProduction: true,
      isDevelopment: false,
      isTest: false,
    });
    expect(config.database).toMatchObject({
      host: 'db.example.com',
      port: 5433,
      username: 'nexa',
      password: 'secret',
      database: 'nexafx_prod',
      ssl: false,
    });
    expect(config.wallet.encryptionKey).toBe('d'.repeat(64));
    expect(config.archive.enabled).toBe(false);
    expect(config.redis).toEqual({
      host: 'redis.example.com',
      port: 6380,
      password: undefined,
    });
  });

  it('rejects invalid wallet encryption keys', () => {
    process.env.WALLET_ENCRYPTION_KEY = 'invalid';

    expect(() => configuration()).toThrow(
      'WALLET_ENCRYPTION_KEY must be a valid 64-character hexadecimal string',
    );
  });
});
