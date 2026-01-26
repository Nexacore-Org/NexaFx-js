import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { UserTier, RiskLevel } from '../entities/rate-limit-rule.entity';

export class UpdateRateLimitRuleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['guest', 'standard', 'premium', 'admin'])
  @IsOptional()
  tier?: UserTier;

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  riskLevel?: RiskLevel;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxRequests?: number;

  @IsInt()
  @Min(1)
  @Max(86400)
  @IsOptional()
  windowSeconds?: number;

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
