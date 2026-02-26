import { IsString, IsInt, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class UpdateThrottleConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxBatchSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  windowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateThrottleRuleDto {
  @IsString()
  notificationType: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBatchSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  windowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownSeconds?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}
