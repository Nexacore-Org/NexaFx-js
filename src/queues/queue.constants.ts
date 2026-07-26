export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  NOTIFICATION: 'notification-queue',
  TRANSACTION: 'transaction-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const EMAIL_JOB_NAMES = {
  SEND_EMAIL: 'send-email',
} as const;

export const NOTIFICATION_JOB_NAMES = {
  DISPATCH: 'dispatch-notification',
} as const;

export const TRANSACTION_JOB_NAMES = {
  PROCESS: 'process-transaction',
} as const;
