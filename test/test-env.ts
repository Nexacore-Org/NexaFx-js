/**
 * Issue #1289 — sets every env var required (no default) by
 * `src/config/env.validation.ts`'s Zod schema, for e2e specs that boot the
 * real `AppModule` (and therefore `ConfigModule.forRoot({ validate: validateEnv })`).
 *
 * Call this before `await import('../src/app.module')` (or any earlier
 * import that transitively loads it) in `beforeAll`. Kept centralized so a
 * new required env var added to the schema only needs a fix here, instead
 * of being missed by some e2e specs and not others.
 */
export function setRequiredTestEnv(): void {
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
  process.env.WALLET_ENCRYPTION_KEY =
    'd069384f1faf4ccc19115e02376a747d6e1f7ba6ad4f050cfafffb329bd39216';
  process.env.STELLAR_HOT_WALLET_SECRET = 'test-stellar-hot-wallet-secret';
}
