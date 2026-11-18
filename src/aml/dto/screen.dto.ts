import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { SUPPORTED_CURRENCY_CODES } from '../../currencies/supported-currencies';

export class ScreenUserDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}

export class ScreenTransactionDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsIn(SUPPORTED_CURRENCY_CODES)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  counterpartyName?: string;
}
