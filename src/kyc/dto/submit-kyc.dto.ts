import { IsIn, IsString, IsUrl, Length, MaxLength } from 'class-validator';

export const KYC_DOCUMENT_TYPES = [
  'passport',
  'national_id',
  'drivers_license',
  'residence_permit',
  'utility_bill',
] as const;

/** Body of `POST /kyc/submit`. The owner is always the authenticated caller. */
export class SubmitKycRequestDto {
  @IsIn(KYC_DOCUMENT_TYPES)
  documentType!: string;

  @IsString()
  @Length(4, 64)
  documentNumber!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2048)
  documentUrl!: string;
}
