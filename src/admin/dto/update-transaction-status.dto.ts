import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TransactionStatus } from '../../transactions/transaction.entity';

export class UpdateTransactionStatusDto {
  @IsEnum(TransactionStatus)
  status!: TransactionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
