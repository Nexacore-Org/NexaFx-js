/**
 * Canonical names and payload shapes for the transaction lifecycle events
 * emitted by `TransactionsService`.
 *
 * Both the producer (`TransactionsService`) and the consumers
 * (`NotificationListener`, `WebhooksListener`, the SSE stream in
 * `TransactionsController`) import from here so the wire names cannot drift.
 * Historically the notification listener subscribed to `transaction.completed`
 * (singular) while the service emitted `transactions.completed` (plural), so
 * no push notification ever fired (#1448).
 */

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

export const TransactionEvent = {
  COMPLETED: 'transactions.completed',
  DEPOSIT_COMPLETED: 'transactions.deposit.completed',
  WITHDRAWAL_COMPLETED: 'transactions.withdrawal.completed',
  SWAP_COMPLETED: 'transactions.swap.completed',
  SWAP_FAILED: 'transactions.swap.failed',
  CANCELLED: 'transactions.cancelled',
  REVERSED: 'transactions.reversed',
} as const;

export type TransactionEventName =
  (typeof TransactionEvent)[keyof typeof TransactionEvent];

/** Every transaction event a user-facing consumer may subscribe to. */
export const TRANSACTION_EVENT_NAMES: readonly TransactionEventName[] =
  Object.values(TransactionEvent);

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/**
 * A completed peer-to-peer transfer. Emitted by `TransactionsService` with both
 * sides of the transfer, so the listener can notify sender and receiver with
 * direction-appropriate copy.
 */
export interface TransferCompletedEvent {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: string | number;
  currency: string;
  reference?: string;
  timestamp?: Date;
}

/**
 * A completed deposit, withdrawal or swap. These are single-sided: the
 * affected user is always `userId`.
 */
export interface TransactionSidedEvent {
  transactionId: string;
  userId: string;
  timestamp?: Date;
}

/** A swap that exhausted its retries and was refunded. */
export type SwapFailedEvent = TransactionSidedEvent;

/** A transfer that was reversed by an admin/moderator. */
export interface TransactionReversedEvent {
  transactionId: string;
  reversalTransactionId: string;
  reversedBy: string;
  reason: string;
  /** Parties to the reversed transfer, so both can be notified. */
  senderId?: string;
  receiverId?: string;
  timestamp?: Date;
}
