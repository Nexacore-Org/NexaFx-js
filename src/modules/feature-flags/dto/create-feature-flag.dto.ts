import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateFeatureFlagDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsObject()
  environments?: {
    development?: boolean;
    staging?: boolean;
    production?: boolean;
  };
}
