export type TransactionType = 'RECEIVE' | 'FX_CONVERSION';

export interface TransactionRecord {
  id: string;
  accountId: string;
  type: TransactionType;
  sourceCurrency: string;
  sourceAmount: number;
  destinationCurrency?: string;
  destinationAmount?: number;
  rate?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
