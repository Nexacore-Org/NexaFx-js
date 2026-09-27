// SearchTransactionsDto for admin transaction search (issue #1276).
// Starting point -- TransactionReplayService, risk-scoring, and the
// other missing imports in transactions.module.ts are separate
// follow-ups.
import { IsOptional, IsString, IsISO8601, IsIn } from 'class-validator';

export class SearchTransactionsDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';
}
