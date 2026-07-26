import { IsString, IsArray, IsOptional, IsInt, Min, MinLength, IsDateString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[];

  @IsInt()
  @Min(1)
  @IsOptional()
  rateLimit?: number;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
