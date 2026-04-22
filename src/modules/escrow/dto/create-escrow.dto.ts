import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { EscrowReleaseParty } from '../entities/escrow.entity';

export class CreateEscrowDto {
  @IsUUID()
  senderWalletId: string;

  @IsUUID()
  beneficiaryWalletId: string;

  @IsUUID()
  beneficiaryUserId: string;

  @IsNumber()
  @Min(0.00000001)
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsIn(['SENDER', 'BENEFICIARY'])
  releaseParty: EscrowReleaseParty;

  @IsOptional()
  @IsDateString()
  autoReleaseAt?: string;

  @IsOptional()
  @IsString()
  releaseCondition?: string;

  @IsOptional()
  releaseConditions?: Array<{ party: string; amount: number }>;

  @IsOptional()
  metadata?: Record<string, any>;
}
