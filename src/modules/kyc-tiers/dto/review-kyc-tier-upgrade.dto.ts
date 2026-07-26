import { IsOptional, IsString } from 'class-validator';

export class ReviewKycTierUpgradeDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
