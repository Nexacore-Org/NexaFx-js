import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const SUPPORTED_PAIRS = ['USD/NGN', 'USD/EUR', 'USD/GBP', 'EUR/NGN', 'GBP/NGN'];

export class QueryExchangeRateHistoryDto {
  @IsOptional()
  @IsIn(SUPPORTED_PAIRS)
  pair?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
