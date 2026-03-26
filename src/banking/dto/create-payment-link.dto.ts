export class CreatePaymentLinkDto {
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: Date;
}