import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class BlockIPDto {
  @IsString()
  ip: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsNumber()
  ttl?: number;

  @IsOptional()
  @IsBoolean()
  isAutomatic?: boolean;
}

export class WhitelistIPDto {
  @IsString()
  ip: string;

  @IsString()
  description: string;
}

export class ConfigureRateLimitDto {
  @IsString()
  tier: string;

  @IsNumber()
  windowMs: number;

  @IsNumber()
  max: number;
}
