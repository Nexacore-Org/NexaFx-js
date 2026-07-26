/**
 * Configuration factory that structures validated env vars
 * into logical groups for easy access throughout the app
 *
 * Groups:
 * - app: Application settings (port, environment)
 * - limits: Request body size limits
 * - database: Database connection settings
 * - jwt: JWT authentication settings
 * - refreshToken: Refresh token settings
 * - otp: One-time password settings
 * - wallet: Wallet encryption settings
 * - externalApi: External API credentials
 * - mail: Email/SMTP settings
 * - redis: Redis cache settings
 * - rateLimit: Rate limiting settings
 */
export default () => {
  // WALLET_ENCRYPTION_KEY is required and validated by Zod in env.validation.ts
  const walletKey = process.env.WALLET_ENCRYPTION_KEY!;

  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = parseInt(process.env.PORT || '3000', 10);
  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true';
  const bodyLimitJson = parseInt(process.env.BODY_LIMIT_JSON || '10', 10);
  const bodyLimitUrlencoded = parseInt(
    process.env.BODY_LIMIT_URLENCODED || '10',
    10,
  );
  const idempotencyTtlHours = parseInt(
    process.env.IDEMPOTENCY_TTL_HOURS || '24',
    10,
  );
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const jwtExpiry = parseInt(process.env.JWT_EXPIRY || '3600', 10);
  const slowQueryThresholdMs = parseInt(
    process.env.SLOW_QUERY_THRESHOLD_MS || '1000',
    10,
  );
  const refreshTokenExpiry = parseInt(
    process.env.REFRESH_TOKEN_EXPIRY || '604800',
    10,
  );
  const otpExpiry = parseInt(process.env.OTP_EXPIRY || '300', 10);
  const externalApiTimeout = parseInt(
    process.env.EXTERNAL_API_TIMEOUT || '30000',
    10,
  );
  const mailPort = parseInt(process.env.MAIL_PORT || '587', 10);
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const rateLimitWindowMs = parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || '60000',
    10,
  );
  const rateLimitMaxRequests = parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || '100',
    10,
  );
  const archiveThresholdMonths = parseInt(
    process.env.ARCHIVE_THRESHOLD_MONTHS || '12',
    10,
  );
  const archiveBatchSize = parseInt(
    process.env.ARCHIVE_BATCH_SIZE || '500',
    10,
  );
  const supportedCurrencies = (
    process.env.SUPPORTED_CURRENCIES || 'USD,EUR,GBP,NGN'
  )
    .split(',')
    .map((currency) => currency.trim().toUpperCase())
    .filter(Boolean);
  const cacheExchangeRateTtlSeconds = parseInt(
    process.env.CACHE_EXCHANGE_RATE_TTL_SECONDS || '60',
    10,
  );
  const cacheSupportedCurrenciesTtlSeconds = parseInt(
    process.env.CACHE_SUPPORTED_CURRENCIES_TTL_SECONDS || '86400',
    10,
  );
  const cacheAdminStatsTtlSeconds = parseInt(
    process.env.CACHE_ADMIN_STATS_TTL_SECONDS || '60',
    10,
  );
  const adminAllowedIps = (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  const webhookMaxAttempts = parseInt(
    process.env.WEBHOOK_MAX_ATTEMPTS || '5',
    10,
  );
  const webhookBackoffDelayMs = parseInt(
    process.env.WEBHOOK_BACKOFF_DELAY_MS || '1000',
    10,
  );
  const webhookReplayWindowHours = parseInt(
    process.env.WEBHOOK_REPLAY_WINDOW_HOURS || '24',
    10,
  );
  const blockedCountries = (process.env.BLOCKED_COUNTRIES || '')
    .split(',')
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);

  return {
    // Application settings
    app: {
      nodeEnv,
      port,
      swaggerEnabled,
      isProduction: nodeEnv === 'production',
      isDevelopment: nodeEnv === 'development',
      isTest: nodeEnv === 'test',
    },

    // Request body size limits (in bytes)
    limits: {
      json: bodyLimitJson * 1024 * 1024,
      urlencoded: bodyLimitUrlencoded * 1024 * 1024,
    },

    // Database configuration (validated via Zod in env.validation.ts)
    database: {
      host: process.env.DB_HOST!,
      port: dbPort,
      username: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      ssl: process.env.DB_SSL === 'true',
      url: `postgresql://${process.env.DB_USER!}:${process.env.DB_PASSWORD!}@${process.env.DB_HOST!}:${dbPort}/${process.env.DB_NAME!}`,
    },

    // JWT configuration
    jwt: {
      secret: process.env.JWT_SECRET || '',
      expiry: jwtExpiry,
    },

    // Observability configuration
    slowQueryThresholdMs,

    // Refresh token configuration
    refreshToken: {
      secret: process.env.REFRESH_TOKEN_SECRET || '',
      expiry: refreshTokenExpiry,
    },

    // OTP configuration
    otp: {
      secret: process.env.OTP_SECRET || '',
      expiry: otpExpiry,
    },

    // Wallet encryption configuration
    wallet: {
      encryptionKey: walletKey,
    },

    // External API configuration
    externalApi: {
      key: process.env.EXTERNAL_API_KEY || '',
      url: process.env.EXTERNAL_API_URL || '',
      timeout: externalApiTimeout,
    },

    // Mail configuration
    mail: {
      host: process.env.MAIL_HOST || '',
      port: mailPort,
      user: process.env.MAIL_USER || '',
      password: process.env.MAIL_PASSWORD || '',
      from: process.env.MAIL_FROM || '',
      secure: process.env.MAIL_SECURE === 'true',
    },

    // Redis configuration
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: redisPort,
      password: process.env.REDIS_PASSWORD,
    },

    // Rate limiting configuration
    rateLimit: {
      windowMs: rateLimitWindowMs,
      maxRequests: rateLimitMaxRequests,
    },

    // Idempotency configuration
    idempotency: {
      ttlHours: idempotencyTtlHours,
      cleanupCron: process.env.IDEMPOTENCY_CLEANUP_CRON || '0 0 * * *',
    },

    // Data archival configuration
    archive: {
      enabled: (process.env.ARCHIVE_ENABLED || 'true') === 'true',
      thresholdMonths: archiveThresholdMonths,
      batchSize: archiveBatchSize,
      cron: process.env.ARCHIVE_CRON || '0 3 * * *',
    },

    cache: {
      exchangeRateTtlSeconds: cacheExchangeRateTtlSeconds,
      supportedCurrenciesTtlSeconds: cacheSupportedCurrenciesTtlSeconds,
      adminStatsTtlSeconds: cacheAdminStatsTtlSeconds,
      defaultTtlSeconds: cacheExchangeRateTtlSeconds,
    },

    currencies: {
      supported: supportedCurrencies,
    },

    security: {
      adminAllowedIps,
    },

    webhooks: {
      maxAttempts: webhookMaxAttempts,
      backoffDelayMs: webhookBackoffDelayMs,
      replayWindowHours: webhookReplayWindowHours,
    },

    // Terms and conditions configuration
    terms: {
      currentVersion: process.env.TERMS_CURRENT_VERSION || '1.0',
    },

    // Compliance / geo-blocking configuration
    compliance: {
      blockedCountries,
    },

    // Push notification configuration
    push: {
      fcmServerKey: process.env.FCM_SERVER_KEY || '',
      apnsKeyId: process.env.APNS_KEY_ID || '',
      apnsTeamId: process.env.APNS_TEAM_ID || '',
      apnsBundleId: process.env.APNS_BUNDLE_ID || '',
      apnsPrivateKey: process.env.APNS_PRIVATE_KEY || '',
    },

    // Referral program configuration
    referral: {
      rewardAmount: parseFloat(process.env.REFERRAL_REWARD_AMOUNT || '10'),
      maxReferrals: parseInt(process.env.REFERRAL_MAX_REFERRALS || '100', 10),
      programActive: (process.env.REFERRAL_PROGRAM_ACTIVE || 'true') === 'true',
    },

    // AML monitoring configuration
    aml: {
      structuringThreshold: parseFloat(
        process.env.AML_STRUCTURING_THRESHOLD || '10000',
      ),
      structuringWindowHours: parseInt(
        process.env.AML_STRUCTURING_WINDOW_HOURS || '24',
        10,
      ),
      structuringMinCount: parseInt(
        process.env.AML_STRUCTURING_MIN_COUNT || '3',
        10,
      ),
      smurfingWindowHours: parseInt(
        process.env.AML_SMURFING_WINDOW_HOURS || '1',
        10,
      ),
      smurfingMinWallets: parseInt(
        process.env.AML_SMURFING_MIN_WALLETS || '3',
        10,
      ),
      smurfingAmountVariancePct: parseFloat(
        process.env.AML_SMURFING_VARIANCE_PCT || '5',
      ),
      velocityBurstWindowHours: parseInt(
        process.env.AML_VELOCITY_WINDOW_HOURS || '1',
        10,
      ),
      velocityBurstMaxCount: parseInt(
        process.env.AML_VELOCITY_MAX_COUNT || '10',
        10,
      ),
      riskScoreWeight: parseInt(process.env.AML_RISK_SCORE_WEIGHT || '30', 10),
    },
    // FX configuration
    fx: {
      reversalWindowMinutes: parseInt(
        process.env.FX_REVERSAL_WINDOW_MINUTES || '5',
        10,
      ),
      openExchangeRatesApiKey: process.env.OPEN_EXCHANGE_RATES_API_KEY || '',
      exchangeRateHostApiKey: process.env.EXCHANGE_RATE_HOST_API_KEY || '',
    },

    // Swap / FX slippage — validated via Zod; never read process.env directly
    swap: {
      slippagePercent: parseFloat(
        process.env.SWAP_SLIPPAGE_PERCENT || '0.005',
      ),
      previewCacheTtlSeconds: parseInt(
        process.env.SWAP_PREVIEW_CACHE_TTL_SECONDS || '30',
        10,
      ),
    },

    // Scheduled-jobs configuration
    scheduledJobs: {
      pendingTxTimeoutMinutes: parseInt(
        process.env.PENDING_TX_TIMEOUT_MINUTES || '30',
        10,
      ),
    // Auth-specific throttle limit (validated via Zod — must be a positive integer)
    throttleAuth: {
      limit: parseInt(process.env.THROTTLE_AUTH_LIMIT || '5', 10),
    },

    // Stellar hot wallet (required only when Stellar payments are enabled)
    stellar: {
      hotWalletSecret: process.env.STELLAR_HOT_WALLET_SECRET ?? null,
    },
  };
};

/**
 * Type definition for the configuration object
 * This provides type safety when accessing config via ConfigService
 */
export type Configuration = ReturnType<
  typeof import('./configuration').default
>;
