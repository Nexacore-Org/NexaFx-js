import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { TransactionStatus } from '../../transactions/transaction.entity';

export class ExportTransactionsDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsIn(['csv'])
  format!: 'csv';

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  currency?: string;
}

export interface ExportTransactionsJobData extends ExportTransactionsDto {
  requestedByEmail: string;
}
