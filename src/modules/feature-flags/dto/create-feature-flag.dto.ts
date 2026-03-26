import { IsString, IsOptional, IsBoolean, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TargetingRule } from '../entities/feature-flag.entity';

export class CreateFeatureFlagDto {
  @ApiProperty({ description: 'Unique flag name (slug)', example: 'new-dashboard' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Human-readable description', example: 'Enables the redesigned dashboard' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Global enabled state', example: false })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description: 'Per-environment overrides',
    example: { development: true, staging: true, production: false },
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
    example: [{ type: 'percentage', value: 25 }],
  })
  @IsOptional()
  @IsArray()
  targetingRules?: TargetingRule[];
}
