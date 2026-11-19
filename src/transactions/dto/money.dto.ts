import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { IsStellarAddress } from '../../common/validators/is-stellar-address.decorator';

export class CreateTransferDto {
  @ApiProperty({ description: 'User id of the transfer recipient' })
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @ApiProperty({ minimum: 0.00000001, maximum: 999999999.99999999 })
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateInternalTransferDto {
  @ApiProperty({ example: 'recipient@example.com' })
  @IsEmail()
  recipientEmail: string;

  @ApiProperty({ minimum: 0.00000001, maximum: 999999999.99999999 })
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateWithdrawalDto {
  @ApiProperty({ minimum: 0.00000001, maximum: 999999999.99999999 })
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    description: 'Funded Stellar account the funds are sent to',
    example: 'GABC...',
  })
  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  destinationAddress: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateDepositDto {
  @ApiProperty({ minimum: 0.00000001, maximum: 999999999.99999999 })
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateSwapDto {
  @ApiProperty({ minimum: 0.00000001, maximum: 999999999.99999999 })
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  fromAmount: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiPropertyOptional({
    description: 'Ignored server-side; the quote is derived from the rate source',
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  toAmount?: number;

  @ApiProperty({ example: 'EUR' })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
