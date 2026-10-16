import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { API_KEY_MAX_RATE_LIMIT, API_KEY_SCOPES } from '../api-key-scopes';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(API_KEY_SCOPES.length)
  @IsIn(API_KEY_SCOPES, { each: true })
  @IsOptional()
  scopes?: string[];

  /** Requests allowed per hour for this key (server-side cap applies). */
  @IsInt()
  @Min(1)
  @Max(API_KEY_MAX_RATE_LIMIT)
  @IsOptional()
  rateLimit?: number;

  /** Must be in the future and at most one year away. */
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
