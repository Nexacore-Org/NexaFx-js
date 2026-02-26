export const QUEUE_NAMES = {
  RETRY_JOBS: 'retry-jobs',
  RECONCILIATION: 'reconciliation',
  FRAUD_SCORING: 'fraud-scoring',
  WEBHOOK_DISPATCH: 'webhook-dispatch',
  DEAD_LETTER: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  // Retry Jobs
  RETRY_PAYMENT: 'retry-payment',
  RETRY_TRANSFER: 'retry-transfer',
  RETRY_NOTIFICATION: 'retry-notification',

  // Reconciliation Jobs
  RECONCILE_TRANSACTIONS: 'reconcile-transactions',
  RECONCILE_BALANCES: 'reconcile-balances',
  RECONCILE_LEDGER: 'reconcile-ledger',

  // Fraud Jobs
  SCORE_TRANSACTION: 'score-transaction',
  REVIEW_ACCOUNT: 'review-account',
  FLAG_SUSPICIOUS: 'flag-suspicious',

  // Webhook Jobs
  DISPATCH_WEBHOOK: 'dispatch-webhook',
  VERIFY_WEBHOOK_DELIVERY: 'verify-webhook-delivery',

  // Dead Letter
  PROCESS_DLQ: 'process-dlq',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600,
  },
  removeOnFail: false,
};

export const QUEUE_CONCURRENCY = {
  [QUEUE_NAMES.RETRY_JOBS]: 5,
  [QUEUE_NAMES.RECONCILIATION]: 2,
  [QUEUE_NAMES.FRAUD_SCORING]: 10,
  [QUEUE_NAMES.WEBHOOK_DISPATCH]: 20,
  [QUEUE_NAMES.DEAD_LETTER]: 1,
};
