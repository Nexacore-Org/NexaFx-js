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
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateInternalTransferDto {
  @IsEmail()
  recipientEmail: string;

  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateWithdrawalDto {
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  @IsStellarAddress()
  destinationAddress: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateDepositDto {
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateSwapDto {
  @IsNumber()
  @IsPositive()
  @Min(0.00000001)
  @Max(999999999.99999999)
  fromAmount: number;

  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  toAmount?: number;

  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
