import { BadRequestException } from '@nestjs/common';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { TransactionStatus } from '../../transactions/transaction.entity';

/** Longest window one export may cover. */
export const MAX_EXPORT_DAYS = 366;

/** `from` must not be after `to`, and the span is capped at {@link MAX_EXPORT_DAYS}. */
export function assertExportWindow(from: string, to: string): void {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
    throw new BadRequestException('`from` must be a valid date that is not after `to`');
  }
  if (end - start > MAX_EXPORT_DAYS * 86_400_000) {
    throw new BadRequestException(`Export window may not exceed ${MAX_EXPORT_DAYS} days`);
  }
}

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
