/**
 * Disputes environment configuration reader and validator
 *
 * IMPORTANT: Example values live in `backend/.env.example`.
 * This module must never contain secrets or example values.
 */

const REQUIRED_KEYS = [
  // Database
  'DATABASE_URL',

  // Redis (for Bull queues)
  'REDIS_HOST',
  'REDIS_PORT',

  // AWS S3 (for file storage)
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_S3_BUCKET',

  // Email Service (SendGrid)
  'EMAIL_ENABLED',
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',

  // JWT
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
];

export function validateEnvironmentVariables(): string[] {
  const missing: string[] = [];
  const env = process.env;
  for (const key of REQUIRED_KEYS) {
    if (!env[key] || env[key] === '') {
      missing.push(key);
    }
  }
  return missing;
}

export function getEnvironmentConfig() {
  const env = process.env;

  return {
    database: {
      url: env.DATABASE_URL,
    },
    redis: {
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT || '6379'),
      password: env.REDIS_PASSWORD || undefined,
    },
    aws: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_REGION,
      s3Bucket: env.AWS_S3_BUCKET,
    },
    email: {
      enabled: env.EMAIL_ENABLED === 'true',
      sendgridApiKey: env.SENDGRID_API_KEY,
      fromEmail: env.SENDGRID_FROM_EMAIL,
    },
    sms: {
      enabled: env.SMS_ENABLED === 'true',
      twilioAccountSid: env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: env.TWILIO_PHONE_NUMBER,
    },
    push: {
      enabled: env.PUSH_ENABLED === 'true',
      firebaseServiceAccountPath: env.FIREBASE_SERVICE_ACCOUNT_PATH,
      firebaseServiceAccountKey: env.FIREBASE_SERVICE_ACCOUNT_KEY,
    },
    app: {
      nodeEnv: env.NODE_ENV || 'development',
      port: parseInt(env.PORT || '3000'),
      frontendUrl: env.FRONTEND_URL,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    },
    stellar: {
      network: env.STELLAR_NETWORK || 'testnet',
      secretKey: env.STELLAR_SECRET_KEY,
      publicKey: env.STELLAR_PUBLIC_KEY,
    },
    features: {
      autoResolution: env.AUTO_RESOLUTION_ENABLED !== 'false',
      fraudDetection: env.FRAUD_DETECTION_ENABLED !== 'false',
      businessHours: env.BUSINESS_HOURS_ENABLED !== 'false',
    },
    limits: {
      maxFileSize: parseInt(env.MAX_FILE_SIZE || '10485760'),
      maxFilesPerUpload: parseInt(env.MAX_FILES_PER_UPLOAD || '10'),
      autoResolutionMaxAmount: parseInt(
        env.AUTO_RESOLUTION_MAX_AMOUNT || '50000',
      ),
    },
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
    fraud: {
      highRiskThreshold: parseInt(env.FRAUD_HIGH_RISK_THRESHOLD || '80'),
      mediumRiskThreshold: parseInt(env.FRAUD_MEDIUM_RISK_THRESHOLD || '50'),
      lowRiskThreshold: parseInt(env.FRAUD_LOW_RISK_THRESHOLD || '20'),
    },
    businessHours: {
      enabled: env.BUSINESS_HOURS_ENABLED === 'true',
      timezone: env.BUSINESS_HOURS_TIMEZONE || 'Africa/Lagos',
      start: env.BUSINESS_HOURS_START || '09:00',
      end: env.BUSINESS_HOURS_END || '17:00',
      days: env.BUSINESS_HOURS_DAYS?.split(',').map(Number) || [1, 2, 3, 4, 5],
    },
  };
}
