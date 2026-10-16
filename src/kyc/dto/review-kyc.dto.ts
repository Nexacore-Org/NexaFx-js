import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { KycDocumentStatus } from '../kyc-document.entity';

/** Admin decision on a KYC document. The reviewer is the authenticated admin, never the body. */
export class ReviewKycRequestDto {
  @IsIn([KycDocumentStatus.APPROVED, KycDocumentStatus.REJECTED])
  status!: KycDocumentStatus.APPROVED | KycDocumentStatus.REJECTED;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
