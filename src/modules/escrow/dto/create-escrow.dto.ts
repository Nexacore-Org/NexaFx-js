import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Max } from 'class-validator';

export class CreateEscrowDto {
  @IsUUID()
  payeeId!: string;

  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  @Max(1_000_000_000)
  amount!: number;

  @IsString()
  @Length(3, 10)
  currency!: string;

  @IsOptional()
  @IsDateString()
  releaseAfter?: string;
}
