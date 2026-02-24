import { registerAs } from '@nestjs/config';

export const queueConfig = registerAs('queue', () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_QUEUE_DB || '1', 10),
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 1000,
      age: 86400,
    },
    removeOnFail: false,
  },
  concurrency: {
    retryJobs: parseInt(process.env.QUEUE_RETRY_CONCURRENCY || '5', 10),
    reconciliation: parseInt(process.env.QUEUE_RECONCILIATION_CONCURRENCY || '2', 10),
    fraudScoring: parseInt(process.env.QUEUE_FRAUD_CONCURRENCY || '10', 10),
    webhookDispatch: parseInt(process.env.QUEUE_WEBHOOK_CONCURRENCY || '20', 10),
    deadLetter: parseInt(process.env.QUEUE_DLQ_CONCURRENCY || '1', 10),
  },
  dashboard: {
    enabled: process.env.QUEUE_DASHBOARD_ENABLED !== 'false',
    path: process.env.QUEUE_DASHBOARD_PATH || '/queue-dashboard',
    username: process.env.QUEUE_DASHBOARD_USERNAME || 'admin',
    password: process.env.QUEUE_DASHBOARD_PASSWORD || 'changeme',
  },
  stalledInterval: parseInt(process.env.QUEUE_STALLED_INTERVAL || '30000', 10),
  maxStalledCount: parseInt(process.env.QUEUE_MAX_STALLED_COUNT || '2', 10),
}));
