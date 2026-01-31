import { IsString, IsOptional, MaxLength, IsObject } from 'class-validator';

export class UpdateWalletAliasDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  alias?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}