import { IsString, IsObject, IsOptional } from 'class-validator';

export class RequestKycTierUpgradeDto {
  @IsString()
  requestedTier: string;

  @IsOptional()
  @IsObject()
  documents?: Record<string, any>;
}
