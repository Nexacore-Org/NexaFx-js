import { IsIn, IsObject, IsOptional } from 'class-validator';
import { KycTier } from '../../../users/user.entity';

/** Tiers a user can ask for (NONE is the starting point, never a target). */
export const REQUESTABLE_TIERS = [KycTier.BASIC, KycTier.ADVANCED, KycTier.VERIFIED] as const;

export class RequestKycTierUpgradeDto {
  @IsIn(REQUESTABLE_TIERS)
  requestedTier!: KycTier;

  @IsOptional()
  @IsObject()
  documents?: Record<string, any>;
}
