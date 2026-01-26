import { IsOptional, IsString, IsBoolean, IsObject } from 'class-validator';

export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  environments?: {
    development?: boolean;
    staging?: boolean;
    production?: boolean;
  };
}
