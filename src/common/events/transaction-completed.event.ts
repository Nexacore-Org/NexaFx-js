export interface TransactionCompletedEvent {
  transactionId: string;
  userId: string;
  amount: string;
  currency: string;
  timestamp: Date;
}
