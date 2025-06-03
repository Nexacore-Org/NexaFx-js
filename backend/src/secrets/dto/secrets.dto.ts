import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  MinLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SecretType {
  API_KEY = 'API_KEY',
  JWT_SECRET = 'JWT_SECRET',
  DATABASE_PASSWORD = 'DATABASE_PASSWORD',
  ENCRYPTION_KEY = 'ENCRYPTION_KEY',
  WEBHOOK_SECRET = 'WEBHOOK_SECRET',
  OAUTH_CLIENT_SECRET = 'OAUTH_CLIENT_SECRET',
}

export class CreateSecretDto {
  @ApiProperty({ description: 'Name of the secret' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @ApiProperty({ description: 'Secret value' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  value: string;

  @ApiProperty({ enum: SecretType, description: 'Type of secret' })
  @IsEnum(SecretType)
  type: SecretType;

  @ApiPropertyOptional({ description: 'Description of the secret' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the secret is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Expiration date of the secret' })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'List of service IDs affected by this secret' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedServiceIds?: string[];
}

export class UpdateSecretDto {
  @ApiPropertyOptional({ description: 'Name of the secret' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name?: string;

  @ApiPropertyOptional({ description: 'Secret value' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  value?: string;

  @ApiPropertyOptional({ description: 'Description of the secret' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the secret is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Expiration date of the secret' })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'List of service IDs affected by this secret' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedServiceIds?: string[];
}

export class RotateSecretDto {
  @ApiPropertyOptional({ 
    description: 'New secret value (if not provided, will be auto-generated)' 
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newValue?: string;

  @ApiPropertyOptional({ 
    description: 'Whether to notify affected services', 
    default: true 
  })
  @IsOptional()
  @IsBoolean()
  notifyServices?: boolean;
}

export class AffectedServiceDto {
  @ApiProperty({ description: 'Service ID' })
  id: string;

  @ApiProperty({ description: 'Service name' })
  name: string;

  @ApiProperty({ description: 'Service endpoint' })
  endpoint: string;
}

export class SecretResponseDto {
  @ApiProperty({ description: 'Secret ID' })
  id: string;

  @ApiProperty({ description: 'Secret name' })
  name: string;

  @ApiProperty({ enum: SecretType, description: 'Secret type' })
  type: SecretType;

  @ApiPropertyOptional({ description: 'Secret description' })
  description?: string;

  @ApiProperty({ description: 'Whether the secret is active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Secret expiration date' })
  expiresAt?: Date;

  @ApiProperty({ description: 'Last rotation timestamp' })
  lastRotatedAt: Date;

  @ApiProperty({ description: 'Number of times the secret has been rotated' })
  rotationCount: number;

  @ApiProperty({ type: [AffectedServiceDto], description: 'Services affected by this secret' })
  affectedServices: AffectedServiceDto[];

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of items' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  pages: number;
}

export class PaginatedSecretsDto {
  @ApiProperty({ type: [SecretResponseDto], description: 'List of secrets' })
  data: SecretResponseDto[];

  @ApiProperty({ type: PaginationMetaDto, description: 'Pagination metadata' })
  meta: PaginationMetaDto;
}

export class FindAllSecretsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Search term for name or description' })
  @IsOptional()
  @IsString()
  search?: string;
}