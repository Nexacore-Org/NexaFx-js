import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class UpdateRateDto {
  @IsString()
  @IsNotEmpty()
  base: string;

  @IsString()
  @IsNotEmpty()
  quote: string;

  @IsNumberString()
  rate: string; // decimal string
}

export class SetMarginDto {
  @IsString()
  @IsNotEmpty()
  base: string;

  @IsString()
  @IsNotEmpty()
  quote: string;

  @IsNumberString()
  margin: string; // e.g., 0.015
}

export class RatesQueryDto {
  @IsOptional()
  @IsString()
  base?: string;

  @IsOptional()
  @IsString()
  quote?: string;
}


