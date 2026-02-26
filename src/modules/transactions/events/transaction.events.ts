/**
 * Domain event names for the transaction lifecycle.
 * Emitted only after the corresponding DB transaction has committed.
 */
export const TRANSACTION_CREATED = 'transaction.created';
export const TRANSACTION_PROCESSING = 'transaction.processing';
export const TRANSACTION_COMPLETED = 'transaction.completed';
export const TRANSACTION_FAILED = 'transaction.failed';

export type TransactionEventName =
  | typeof TRANSACTION_CREATED
  | typeof TRANSACTION_PROCESSING
  | typeof TRANSACTION_COMPLETED
  | typeof TRANSACTION_FAILED;

/** Base payload for all transaction events */
export interface TransactionEventPayload {
  transactionId: string;
  timestamp: Date;
}

export interface TransactionCreatedPayload extends TransactionEventPayload {
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
  payload?: Record<string, any>;
}

export interface TransactionProcessingPayload extends TransactionEventPayload {
  startedAt: Date;
}

export interface TransactionCompletedPayload extends TransactionEventPayload {
  completedAt: Date;
  durationMs?: number;
  metadata?: Record<string, any>;
}

export interface TransactionFailedPayload extends TransactionEventPayload {
  failedAt: Date;
  errorMessage: string;
  errorCode?: string;
  retryable?: boolean;
  meta?: Record<string, any>;
}
