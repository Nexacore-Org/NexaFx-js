import { IsOptional, IsString, Length, Matches } from 'class-validator';

/** Request body for creating a beneficiary. userId is deliberately absent: it comes from req.user (issue #1398). */
export class CreateBeneficiaryDto {
  @IsString()
  @Length(1, 64)
  alias: string;

  // Stellar public key (G... 56 chars, base32).
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'address must be a valid Stellar public key' })
  address: string;

  @IsString()
  @Length(3, 10)
  currency: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  network?: string;
}
