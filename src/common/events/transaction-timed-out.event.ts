export interface TransactionTimedOutEvent {
  transactionId: string;
  userId: string;
  amount: string;
  currency: string;
  refunded: boolean;
  timestamp: Date;
}
