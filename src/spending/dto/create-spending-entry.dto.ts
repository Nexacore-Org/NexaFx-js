import { IsString, IsNumber, IsOptional, IsDateString, IsUUID, MaxLength, IsPositive } from 'class-validator';

export class CreateSpendingEntryDto {
  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsDateString()
  date: string;
}
