import { validateWalletEncryptionKey } from "./env.validation";

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
  // Additional runtime validation for wallet encryption key format
  const walletKey = process.env.WALLET_ENCRYPTION_KEY || "";
  if (walletKey && !validateWalletEncryptionKey(walletKey)) {
    throw new Error(
      "WALLET_ENCRYPTION_KEY must be a valid 64-character hexadecimal string"
    );
  }

  const nodeEnv = process.env.NODE_ENV || "development";
  const port = parseInt(process.env.PORT || "3000", 10);
  const bodyLimitJson = parseInt(process.env.BODY_LIMIT_JSON || "10", 10);
  const bodyLimitUrlencoded = parseInt(process.env.BODY_LIMIT_URLENCODED || "10", 10);
  const dbPort = parseInt(process.env.DB_PORT || "5432", 10);
  const jwtExpiry = parseInt(process.env.JWT_EXPIRY || "3600", 10);
  const refreshTokenExpiry = parseInt(process.env.REFRESH_TOKEN_EXPIRY || "604800", 10);
  const otpExpiry = parseInt(process.env.OTP_EXPIRY || "300", 10);
  const externalApiTimeout = parseInt(process.env.EXTERNAL_API_TIMEOUT || "30000", 10);
  const mailPort = parseInt(process.env.MAIL_PORT || "587", 10);
  const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
  const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
  const rateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10);
  const archiveThresholdMonths = parseInt(process.env.ARCHIVE_THRESHOLD_MONTHS || "12", 10);
  const archiveBatchSize = parseInt(process.env.ARCHIVE_BATCH_SIZE || "500", 10);

  return {
    // Application settings
    app: {
      nodeEnv,
      port,
      isProduction: nodeEnv === "production",
      isDevelopment: nodeEnv === "development",
      isTest: nodeEnv === "test",
    },

    // Request body size limits (in bytes)
    limits: {
      json: bodyLimitJson * 1024 * 1024,
      urlencoded: bodyLimitUrlencoded * 1024 * 1024,
    },

    // Database configuration
    database: {
      host: process.env.DB_HOST || "localhost",
      port: dbPort,
      username: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "nexafx",
      ssl: process.env.DB_SSL === "true",
      url: `postgresql://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || ""}@${process.env.DB_HOST || "localhost"}:${dbPort}/${process.env.DB_NAME || "nexafx"}`,
    },

    // JWT configuration
    jwt: {
      secret: process.env.JWT_SECRET || "",
      expiry: jwtExpiry,
    },

    // Refresh token configuration
    refreshToken: {
      secret: process.env.REFRESH_TOKEN_SECRET || "",
      expiry: refreshTokenExpiry,
    },

    // OTP configuration
    otp: {
      secret: process.env.OTP_SECRET || "",
      expiry: otpExpiry,
    },

    // Wallet encryption configuration
    wallet: {
      encryptionKey: walletKey,
    },

    // External API configuration
    externalApi: {
      key: process.env.EXTERNAL_API_KEY || "",
      url: process.env.EXTERNAL_API_URL || "",
      timeout: externalApiTimeout,
    },

    // Mail configuration
    mail: {
      host: process.env.MAIL_HOST || "",
      port: mailPort,
      user: process.env.MAIL_USER || "",
      password: process.env.MAIL_PASSWORD || "",
      from: process.env.MAIL_FROM || "",
      secure: process.env.MAIL_SECURE === "true",
    },

    // Redis configuration
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: redisPort,
      password: process.env.REDIS_PASSWORD,
    },

    // Rate limiting configuration
    rateLimit: {
      windowMs: rateLimitWindowMs,
      maxRequests: rateLimitMaxRequests,
    },

    // Data archival configuration
    archive: {
      enabled: (process.env.ARCHIVE_ENABLED || 'true') === "true",
      thresholdMonths: archiveThresholdMonths,
      batchSize: archiveBatchSize,
      cron: process.env.ARCHIVE_CRON || '0 3 * * *',
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
      structuringThreshold: parseFloat(process.env.AML_STRUCTURING_THRESHOLD || '10000'),
      structuringWindowHours: parseInt(process.env.AML_STRUCTURING_WINDOW_HOURS || '24', 10),
      structuringMinCount: parseInt(process.env.AML_STRUCTURING_MIN_COUNT || '3', 10),
      smurfingWindowHours: parseInt(process.env.AML_SMURFING_WINDOW_HOURS || '1', 10),
      smurfingMinWallets: parseInt(process.env.AML_SMURFING_MIN_WALLETS || '3', 10),
      smurfingAmountVariancePct: parseFloat(process.env.AML_SMURFING_VARIANCE_PCT || '5'),
      velocityBurstWindowHours: parseInt(process.env.AML_VELOCITY_WINDOW_HOURS || '1', 10),
      velocityBurstMaxCount: parseInt(process.env.AML_VELOCITY_MAX_COUNT || '10', 10),
      riskScoreWeight: parseInt(process.env.AML_RISK_SCORE_WEIGHT || '30', 10),
    },
  };
};

/**
 * Type definition for the configuration object
 * This provides type safety when accessing config via ConfigService
 */
export type Configuration = ReturnType<typeof import("./configuration").default>;
