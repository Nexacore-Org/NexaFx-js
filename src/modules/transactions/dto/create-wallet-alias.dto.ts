import { IsString, IsNotEmpty, MaxLength, IsOptional, IsObject } from 'class-validator';

export class CreateWalletAliasDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  alias: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}