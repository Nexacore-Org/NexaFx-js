import { z } from 'zod';

/**
 * Environment validation schema using Zod
 * All environment variables are validated at application startup
 * Fail-fast approach: Application will not start with invalid configuration
 */

// Hex string validation helper (for wallet encryption key)
const hexStringRegex = /^[0-9a-fA-F]+$/;

export const envSchema = z.object({
  // ============================================
  // Application Configuration
  // ============================================
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(65535))
    .default(() => 3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SWAGGER_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default(() => false),

  // ============================================
  // Request Body Size Limits (environment-configurable)
  // ============================================
  BODY_LIMIT_JSON: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(100))
    .default(() => 10), // MB
  BODY_LIMIT_URLENCODED: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(100))
    .default(() => 10), // MB

  // ============================================
  // Database Configuration
  // ============================================
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_SSL: z
    .string()
    .transform((val) => val === 'true')
    .default(() => false),

  // ============================================
  // JWT Configuration
  // ============================================
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for security'),
  JWT_EXPIRY: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(() => 3600),

  // ============================================
  // Observability Configuration
  // ============================================
  SLOW_QUERY_THRESHOLD_MS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(() => 1000),

  // ============================================
  // Refresh Token Configuration
  // ============================================
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(
      32,
      'REFRESH_TOKEN_SECRET must be at least 32 characters for security',
    ),
  REFRESH_TOKEN_EXPIRY: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(() => 604800), // 7 days in seconds

  // ============================================
  // OTP Configuration
  // ============================================
  OTP_SECRET: z
    .string()
    .min(32, 'OTP_SECRET must be at least 32 characters for security'),
  OTP_EXPIRY: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(() => 300), // 5 minutes in seconds

  // ============================================
  // Wallet Encryption Configuration
  // ============================================
  // WALLET_ENCRYPTION_KEY: z
  //   .string()
  //   .length(64, "WALLET_ENCRYPTION_KEY must be exactly 64 characters (hex)"),

  // ============================================
  // External Service Credentials
  // ============================================
  // EXTERNAL_API_KEY: z.string().min(1, "EXTERNAL_API_KEY is required"),
  // EXTERNAL_API_URL: z.string().url("EXTERNAL_API_URL must be a valid URL"),
  // EXTERNAL_API_TIMEOUT: z
  //   .string()
  //   .transform(Number)
  //   .pipe(z.number().positive())
  //   .default(() => 30000),

  // ============================================
  // Mail Configuration
  // ============================================
  MAIL_HOST: z.string().min(1, 'MAIL_HOST is required'),
  MAIL_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),
  MAIL_USER: z.string().email('MAIL_USER must be a valid email'),
  MAIL_PASSWORD: z.string().min(1, 'MAIL_PASSWORD is required'),
  MAIL_FROM: z.string().email('MAIL_FROM must be a valid email'),
  MAIL_SECURE: z
    .string()
    .transform((val) => val === 'true')
    .default(() => false),

  // ============================================
  // Redis Configuration (optional, for caching/sessions)
  // ============================================
  REDIS_HOST: z.string().optional().default('localhost'),
  REDIS_PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(65535))
    .default(() => 6379),
  REDIS_PASSWORD: z.string().optional(),

  // ============================================
  // Rate Limiting Configuration
  // ============================================
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(() => 60000),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(() => 100),

  // ============================================
  // Idempotency Configuration
  // ============================================
  IDEMPOTENCY_TTL_HOURS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(() => 24),
  IDEMPOTENCY_CLEANUP_CRON: z
    .string()
    .min(1)
    .default(() => '0 0 * * *'),

  // ============================================
  // Data Archival Configuration
  // ============================================
  ARCHIVE_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default(() => true),
  ARCHIVE_THRESHOLD_MONTHS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(120))
    .default(() => 12),
  ARCHIVE_BATCH_SIZE: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(10).max(5000))
    .default(() => 500),
  ARCHIVE_CRON: z
    .string()
    .min(1)
    .default(() => '0 3 * * *'),
  SUPPORTED_CURRENCIES: z.string().min(1).default('USD,EUR,GBP,NGN'),
  CACHE_EXCHANGE_RATE_TTL_SECONDS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(() => 60),
  CACHE_SUPPORTED_CURRENCIES_TTL_SECONDS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(() => 86400),
  CACHE_ADMIN_STATS_TTL_SECONDS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(() => 60),
  ADMIN_ALLOWED_IPS: z.string().optional().default(''),
  WEBHOOK_MAX_ATTEMPTS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(() => 5),
  WEBHOOK_BACKOFF_DELAY_MS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(() => 1000),
  WEBHOOK_REPLAY_WINDOW_HOURS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(() => 24),
  TERMS_CURRENT_VERSION: z.string().min(1).default('1.0'),
  BLOCKED_COUNTRIES: z.string().optional().default(''),
  // ============================================
  // External API Configuration
  // ============================================
  EXTERNAL_API_KEY: z.string().optional(),
  EXTERNAL_API_URL: z.string().optional(),
  EXTERNAL_API_TIMEOUT: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(() => 30000),

  // ============================================
  // Push Notification Configuration
  // ============================================
  FCM_SERVER_KEY: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(),

  // ============================================
  // Referral Program
  // ============================================
  REFERRAL_REWARD_AMOUNT: z
    .string()
    .transform(Number)
    .pipe(z.number().nonnegative())
    .default(() => 10),
  REFERRAL_MAX_REFERRALS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 100),
  REFERRAL_PROGRAM_ACTIVE: z
    .string()
    .transform((val) => val === 'true')
    .default(() => true),

  // ============================================
  // AML Monitoring Tuning
  // ============================================
  AML_STRUCTURING_THRESHOLD: z
    .string()
    .transform(Number)
    .pipe(z.number().nonnegative())
    .default(() => 10000),
  AML_STRUCTURING_WINDOW_HOURS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 24),
  AML_STRUCTURING_MIN_COUNT: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 3),
  AML_SMURFING_WINDOW_HOURS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 1),
  AML_SMURFING_MIN_WALLETS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 3),
  AML_SMURFING_VARIANCE_PCT: z
    .string()
    .transform(Number)
    .pipe(z.number().nonnegative())
    .default(() => 5),
  AML_VELOCITY_WINDOW_HOURS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 1),
  AML_VELOCITY_MAX_COUNT: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 10),
  AML_RISK_SCORE_WEIGHT: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 30),

  // ============================================
  // FX / Exchange Rates
  // ============================================
  FX_REVERSAL_WINDOW_MINUTES: z
    .string()
    .transform(Number)
    .pipe(z.number().int().nonnegative())
    .default(() => 5),
  OPEN_EXCHANGE_RATES_API_KEY: z.string().optional(),
  EXCHANGE_RATE_HOST_API_KEY: z.string().optional(),

  // ============================================
  // Wallet Encryption Key (64-char hex)
  // ============================================
  WALLET_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((val) => !val || (hexStringRegex.test(val) && val.length === 64), {
      message: 'WALLET_ENCRYPTION_KEY must be a 64-character hex string',
    }),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns typed config
 * Throws detailed error if validation fails
 * This ensures fail-fast behavior on startup
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  try {
    return envSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new Error(
        `Environment validation failed:\n${errorMessages.join('\n')}`,
      );
    }
    throw error;
  }
}

/**
 * Validates that the wallet encryption key is valid hex
 * Additional validation beyond schema checks
 */
export function validateWalletEncryptionKey(key: string): boolean {
  return hexStringRegex.test(key) && key.length === 64;
}
