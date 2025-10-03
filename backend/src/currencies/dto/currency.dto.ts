import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class AddCurrencyDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 8)
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimals?: number;
}

export class UpdateCurrencyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimals?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}


