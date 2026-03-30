import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateForwardContractDto {
  @ApiProperty({ example: 'USD', description: 'Base currency code' })
  @IsString()
  @Length(2, 10)
  baseCurrency: string;

  @ApiProperty({ example: 'NGN', description: 'Quote currency code' })
  @IsString()
  @Length(2, 10)
  quoteCurrency: string;

  @ApiProperty({ example: 1000, description: 'Notional amount in base currency' })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  notionalAmount: number;

  @ApiProperty({
    example: '2025-09-01T00:00:00.000Z',
    description: 'Contract maturity / settlement date (ISO 8601)',
  })
  @IsDateString()
  maturityDate: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Collateral currency (defaults to baseCurrency)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  collateralCurrency?: string;

  @ApiPropertyOptional({
    example: 200,
    description:
      'Explicit collateral amount to block. If omitted, service derives it from notional.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  collateralAmount?: number;
}

export class CancelForwardContractDto {
  @ApiPropertyOptional({
    example: 'Hedging need removed',
    description: 'Reason for cancellation',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
