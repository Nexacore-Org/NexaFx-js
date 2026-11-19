/** All queues registered by the application. Keep in sync with `QueuesModule`. */
export const QUEUE_NAMES = {
  DEFAULT: 'default',
  EMAIL: 'email-queue',
  NOTIFICATION: 'notification-queue',
  TRANSACTION: 'transaction-queue',
  WEBHOOKS: 'webhooks',
  STATEMENTS: 'statements',
  ADMIN_EXPORTS: 'admin-exports',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface BoundedJobOptions {
  attempts: number;
  backoff: { type: 'exponential'; delay: number };
  removeOnComplete: { age: number; count: number };
  removeOnFail: { age: number; count: number };
}

/**
 * Bounded retention for every queue (#1607). A bare `true` silently deletes
 * failed jobs, while `false` keeps them forever; both leave operators unable
 * to recover a dead letter without growing Redis without limit.
 */
export function getDefaultJobOptions(): BoundedJobOptions {
  return {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
  };
}

/** Bull must stay disabled in tests and when explicitly turned off (#1607). */
export function isBullEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'test' && process.env.DISABLE_BULL !== 'true'
  );
}

export const EMAIL_JOB_NAMES = {
  SEND_EMAIL: 'send-email',
  PASSWORD_RESET: 'password-reset',
} as const;

export const TRANSACTION_JOB_NAMES = {
  PROCESS: 'process-transaction',
} as const;
