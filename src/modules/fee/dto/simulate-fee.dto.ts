import { IsNumber, IsString, IsOptional, Min, Length } from 'class-validator';

export class SimulateFeeDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsOptional()
  @IsString()
  promoCode?: string;
}
