import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { UserTier, RiskLevel } from '../entities/rate-limit-rule.entity';

export class CreateRateLimitRuleDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['guest', 'standard', 'premium', 'admin'])
  tier: UserTier;

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  riskLevel?: RiskLevel;

  @IsInt()
  @Min(1)
  maxRequests: number;

  @IsInt()
  @Min(1)
  @Max(86400) // Max 24 hours
  windowSeconds: number;

  @IsString()
  @IsOptional()
  routePattern?: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}
