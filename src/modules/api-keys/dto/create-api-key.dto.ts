import { IsString, IsArray, IsEnum, IsOptional, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiKeyScope } from '../entities/api-key.entity';

export class CreateApiKeyDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ApiKeyScope, isArray: true })
  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  scopes: ApiKeyScope[];

  @ApiPropertyOptional({ description: 'ISO 8601 expiry date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
