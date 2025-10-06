/**
 * Environment Variables Configuration for Dispute System
 *
 * Copy this file to .env and fill in the actual values
 */

export const requiredEnvironmentVariables = {
  // Database
  DATABASE_URL: 'postgresql://username:password@localhost:5432/nexafx_disputes',

  // Redis (for Bull queues)
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',

  // AWS S3 (for file storage)
  AWS_ACCESS_KEY_ID: 'your-aws-access-key',
  AWS_SECRET_ACCESS_KEY: 'your-aws-secret-key',
  AWS_REGION: 'us-east-1',
  AWS_S3_BUCKET: 'nexafx-disputes',

  // Email Service (SendGrid)
  EMAIL_ENABLED: 'true',
  SENDGRID_API_KEY: 'your-sendgrid-api-key',
  SENDGRID_FROM_EMAIL: 'noreply@nexafx.com',

  // SMS Service (Twilio)
  SMS_ENABLED: 'false', // Set to 'true' to enable SMS notifications
  TWILIO_ACCOUNT_SID: 'your-twilio-account-sid',
  TWILIO_AUTH_TOKEN: 'your-twilio-auth-token',
  TWILIO_PHONE_NUMBER: '+1234567890',

  // Push Notifications (Firebase)
  PUSH_ENABLED: 'false', // Set to 'true' to enable push notifications
  FIREBASE_SERVICE_ACCOUNT_PATH: '/path/to/firebase-service-account.json', // OR
  FIREBASE_SERVICE_ACCOUNT_KEY: '{"type":"service_account","project_id":"..."}', // JSON string

  // Frontend URL (for notification links)
  FRONTEND_URL: 'https://app.nexafx.com',

  // Stellar Network (for refunds - optional for now)
  STELLAR_NETWORK: 'testnet', // 'testnet' or 'mainnet'
  STELLAR_SECRET_KEY: 'your-stellar-secret-key',
  STELLAR_PUBLIC_KEY: 'your-stellar-public-key',

  // Application
  NODE_ENV: 'development', // 'development', 'production', 'test'
  PORT: '3000',

  // JWT
  JWT_SECRET: 'your-jwt-secret-key',
  JWT_EXPIRES_IN: '24h',
};

export const optionalEnvironmentVariables = {
  // Redis (for Bull queues)
  REDIS_PASSWORD: '', // Optional - leave empty for no password

  // Logging
  LOG_LEVEL: 'info', // 'error', 'warn', 'info', 'debug'

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: '900000', // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: '100',

  // File Upload Limits
  MAX_FILE_SIZE: '10485760', // 10MB in bytes
  MAX_FILES_PER_UPLOAD: '10',

  // OCR Configuration
  OCR_CONFIDENCE_THRESHOLD: '0.7',
  OCR_LANGUAGES: 'eng',

  // Auto-resolution
  AUTO_RESOLUTION_ENABLED: 'true',
  AUTO_RESOLUTION_MAX_AMOUNT: '50000', // ₦50,000

  // SLA Configuration
  SLA_INITIAL_RESPONSE_HOURS: '2',
  SLA_SIMPLE_RESOLUTION_HOURS: '24',
  SLA_COMPLEX_RESOLUTION_HOURS: '72',
  SLA_ESCALATED_RESOLUTION_DAYS: '5',

  // Fraud Detection
  FRAUD_DETECTION_ENABLED: 'true',
  FRAUD_HIGH_RISK_THRESHOLD: '80',
  FRAUD_MEDIUM_RISK_THRESHOLD: '50',
  FRAUD_LOW_RISK_THRESHOLD: '20',

  // Business Hours
  BUSINESS_HOURS_ENABLED: 'true',
  BUSINESS_HOURS_TIMEZONE: 'Africa/Lagos',
  BUSINESS_HOURS_START: '09:00',
  BUSINESS_HOURS_END: '17:00',
  BUSINESS_HOURS_DAYS: '1,2,3,4,5', // Monday to Friday
};

/**
 * Environment variable validation
 */
export function validateEnvironmentVariables(): string[] {
  const missing: string[] = [];
  const env = process.env;

  // Check required variables
  for (const [key] of Object.entries(requiredEnvironmentVariables)) {
    if (!env[key]) {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * Get environment configuration with defaults
 */
export function getEnvironmentConfig() {
  const env = process.env;

  return {
    // Database
    database: {
      url: env.DATABASE_URL,
    },

    // Redis
    redis: {
      host: env.REDIS_HOST || 'localhost',
      port: parseInt(env.REDIS_PORT || '6379'),
      password: env.REDIS_PASSWORD || undefined,
    },

    // AWS S3
    aws: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_REGION || 'us-east-1',
      s3Bucket: env.AWS_S3_BUCKET || 'nexafx-disputes',
    },

    // Email
    email: {
      enabled: env.EMAIL_ENABLED === 'true',
      sendgridApiKey: env.SENDGRID_API_KEY,
      fromEmail: env.SENDGRID_FROM_EMAIL || 'noreply@nexafx.com',
    },

    // SMS
    sms: {
      enabled: env.SMS_ENABLED === 'true',
      twilioAccountSid: env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: env.TWILIO_PHONE_NUMBER,
    },

    // Push Notifications
    push: {
      enabled: env.PUSH_ENABLED === 'true',
      firebaseServiceAccountPath: env.FIREBASE_SERVICE_ACCOUNT_PATH,
      firebaseServiceAccountKey: env.FIREBASE_SERVICE_ACCOUNT_KEY,
    },

    // Application
    app: {
      nodeEnv: env.NODE_ENV || 'development',
      port: parseInt(env.PORT || '3000'),
      frontendUrl: env.FRONTEND_URL,
    },

    // JWT
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN || '24h',
    },

    // Stellar
    stellar: {
      network: env.STELLAR_NETWORK || 'testnet',
      secretKey: env.STELLAR_SECRET_KEY,
      publicKey: env.STELLAR_PUBLIC_KEY,
    },

    // Feature Flags
    features: {
      autoResolution: env.AUTO_RESOLUTION_ENABLED !== 'false',
      fraudDetection: env.FRAUD_DETECTION_ENABLED !== 'false',
      businessHours: env.BUSINESS_HOURS_ENABLED !== 'false',
    },

    // Limits
    limits: {
      maxFileSize: parseInt(env.MAX_FILE_SIZE || '10485760'),
      maxFilesPerUpload: parseInt(env.MAX_FILES_PER_UPLOAD || '10'),
      autoResolutionMaxAmount: parseInt(
        env.AUTO_RESOLUTION_MAX_AMOUNT || '50000',
      ),
    },

    // SLA
    sla: {
      initialResponseHours: parseInt(env.SLA_INITIAL_RESPONSE_HOURS || '2'),
      simpleResolutionHours: parseInt(env.SLA_SIMPLE_RESOLUTION_HOURS || '24'),
      complexResolutionHours: parseInt(
        env.SLA_COMPLEX_RESOLUTION_HOURS || '72',
      ),
      escalatedResolutionDays: parseInt(
        env.SLA_ESCALATED_RESOLUTION_DAYS || '5',
      ),
    },

    // Fraud Detection
    fraud: {
      highRiskThreshold: parseInt(env.FRAUD_HIGH_RISK_THRESHOLD || '80'),
      mediumRiskThreshold: parseInt(env.FRAUD_MEDIUM_RISK_THRESHOLD || '50'),
      lowRiskThreshold: parseInt(env.FRAUD_LOW_RISK_THRESHOLD || '20'),
    },

    // Business Hours
    businessHours: {
      enabled: env.BUSINESS_HOURS_ENABLED === 'true',
      timezone: env.BUSINESS_HOURS_TIMEZONE || 'Africa/Lagos',
      start: env.BUSINESS_HOURS_START || '09:00',
      end: env.BUSINESS_HOURS_END || '17:00',
      days: env.BUSINESS_HOURS_DAYS?.split(',').map(Number) || [1, 2, 3, 4, 5],
    },
  };
}
