import { TransactionEntity } from '../entities/transaction.entity';

export class TransactionResponseDto {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  walletId: string;
  fromAddress?: string;
  toAddress?: string;
  externalId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  
  // Wallet alias enrichment fields
  fromWalletAlias?: string;
  toWalletAlias?: string;
  walletAliases?: Record<string, string>;
}

export class PaginatedTransactionResponseDto {
  success: boolean;
  data: TransactionResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
