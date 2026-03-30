import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransactionDto {
  @ApiProperty({ example: 100.5 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'USD', description: '3-letter ISO currency code' })
  @IsString()
  @Length(3, 3)
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'Payment for services' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'wallet-uuid' })
  @IsOptional()
  @IsUUID()
  walletId?: string;

  @ApiPropertyOptional({ example: '0xRecipientAddress' })
  @IsOptional()
  @IsString()
  toAddress?: string;

  @ApiPropertyOptional({ example: '0xSenderAddress' })
  @IsOptional()
  @IsString()
  fromAddress?: string;

  @ApiPropertyOptional({ example: 'ext-ref-123' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ description: 'Target currency for FX conversion', example: 'EUR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  targetCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
