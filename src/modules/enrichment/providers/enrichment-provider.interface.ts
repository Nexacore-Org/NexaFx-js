import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export type EnrichmentResult = {
  provider: string;
  merchantHint?: string;
  categoryHint?: string;
  confidence?: number; // 0 - 1
  extra?: Record<string, any>;
};

export interface EnrichmentProvider {
  name: string;
  enrich(transaction: TransactionEntity): Promise<EnrichmentResult | null>;
}
