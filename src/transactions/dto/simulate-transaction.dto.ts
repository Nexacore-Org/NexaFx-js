import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export const SIMULATABLE_TRANSACTION_TYPES: string[] = [
  'deposit',
  'withdrawal',
  'swap',
  'transfer',
  'internal-transfer',
];

export class SimulateTransactionDto {
  @ApiProperty({ enum: SIMULATABLE_TRANSACTION_TYPES })
  @IsIn(SIMULATABLE_TRANSACTION_TYPES)
  type: string;

  @ApiProperty({ minimum: 0.00000001 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  toCurrency?: string;
}
