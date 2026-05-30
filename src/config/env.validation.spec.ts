import { validateEnv, validateWalletEncryptionKey } from './env.validation';

describe('env validation', () => {
  const validEnv = {
    NODE_ENV: 'production',
    PORT: '4000',
    BODY_LIMIT_JSON: '8',
    BODY_LIMIT_URLENCODED: '9',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USER: 'postgres',
    DB_PASSWORD: 'password',
    DB_NAME: 'nexafx',
    DB_SSL: 'true',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRY: '1800',
    REFRESH_TOKEN_SECRET: 'b'.repeat(32),
    REFRESH_TOKEN_EXPIRY: '7200',
    OTP_SECRET: 'c'.repeat(32),
    OTP_EXPIRY: '120',
    MAIL_HOST: 'smtp.example.com',
    MAIL_PORT: '587',
    MAIL_USER: 'mailer@example.com',
    MAIL_PASSWORD: 'secret',
    MAIL_FROM: 'noreply@example.com',
    MAIL_SECURE: 'true',
    REDIS_HOST: 'redis',
    REDIS_PORT: '6380',
    REDIS_PASSWORD: 'redis-pass',
    RATE_LIMIT_WINDOW_MS: '120000',
    RATE_LIMIT_MAX_REQUESTS: '250',
    ARCHIVE_ENABLED: 'false',
    ARCHIVE_THRESHOLD_MONTHS: '6',
    ARCHIVE_BATCH_SIZE: '100',
    ARCHIVE_CRON: '0 */6 * * *',
  };

  it('parses a valid environment object', () => {
    const parsed = validateEnv(validEnv);

    expect(parsed.NODE_ENV).toBe('production');
    expect(parsed.DB_PORT).toBe(5432);
    expect(parsed.MAIL_SECURE).toBe(true);
    expect(parsed.ARCHIVE_ENABLED).toBe(false);
  });

  it('throws a detailed error when required values are missing', () => {
    expect(() =>
      validateEnv({
        DB_HOST: 'localhost',
      }),
    ).toThrow('Environment validation failed');
  });

  it('validates wallet encryption keys', () => {
    expect(validateWalletEncryptionKey('a'.repeat(64))).toBe(true);
    expect(validateWalletEncryptionKey('not-hex')).toBe(false);
    expect(validateWalletEncryptionKey('a'.repeat(63))).toBe(false);
  });
});
