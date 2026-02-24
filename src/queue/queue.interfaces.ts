export interface RetryPaymentJobData {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  attemptNumber: number;
  originalError?: string;
  idempotencyKey: string;
}

export interface RetryTransferJobData {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  attemptNumber: number;
  idempotencyKey: string;
}

export interface RetryNotificationJobData {
  notificationId: string;
  userId: string;
  channel: 'email' | 'sms' | 'push' | 'webhook';
  payload: Record<string, unknown>;
  templateId?: string;
  idempotencyKey: string;
}

export interface ReconcileTransactionsJobData {
  startDate: string;
  endDate: string;
  accountId?: string;
  forceReconcile?: boolean;
  idempotencyKey: string;
}

export interface ReconcileBalancesJobData {
  accountIds: string[];
  asOfDate: string;
  idempotencyKey: string;
}

export interface ReconcileLedgerJobData {
  ledgerId: string;
  period: string;
  idempotencyKey: string;
}

export interface ScoreTransactionJobData {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  location?: { lat: number; lon: number };
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface ReviewAccountJobData {
  accountId: string;
  triggerReason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  idempotencyKey: string;
}

export interface FlagSuspiciousJobData {
  entityType: 'transaction' | 'account' | 'user';
  entityId: string;
  reasons: string[];
  score: number;
  idempotencyKey: string;
}

export interface DispatchWebhookJobData {
  webhookId: string;
  endpoint: string;
  event: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  signingSecret?: string;
  attemptNumber: number;
  idempotencyKey: string;
}

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobName: string;
  originalJobData: unknown;
  failureReason: string;
  failedAt: string;
  attemptsMade: number;
  idempotencyKey: string;
}

export interface JobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
  idempotencyKey: string;
}
