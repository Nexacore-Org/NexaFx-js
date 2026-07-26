import { IsString, IsNumber, IsOptional, IsDateString, IsUUID, MaxLength } from 'class-validator';

export class CreateSpendingEntryDto {
  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsDateString()
  date: string;
}
