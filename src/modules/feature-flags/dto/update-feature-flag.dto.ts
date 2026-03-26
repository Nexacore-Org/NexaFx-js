import { IsOptional, IsString, IsBoolean, IsObject, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TargetingRule } from '../entities/feature-flag.entity';

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional({ description: 'Human-readable description', example: 'Updated flag description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Global enabled state', example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Per-environment overrides',
    example: { production: true },
  })
  @IsOptional()
  @IsObject()
  environments?: {
    development?: boolean;
    staging?: boolean;
    production?: boolean;
  };

  @ApiPropertyOptional({
    description: 'Targeting rules for percentage rollout, role, country, or userId',
    example: [{ type: 'percentage', value: 50 }],
  })
  @IsOptional()
  @IsArray()
  targetingRules?: TargetingRule[];
}
