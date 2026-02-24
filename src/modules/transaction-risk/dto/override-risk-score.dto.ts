import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class OverrideRiskScoreDto {
  @IsString()
  @MinLength(10)
  reason: string;

  @IsOptional()
  @IsBoolean()
  clearFlag?: boolean;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  overrideLevel?: string;
}
