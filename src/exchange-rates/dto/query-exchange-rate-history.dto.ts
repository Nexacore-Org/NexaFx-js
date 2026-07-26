import { IsOptional, IsString } from 'class-validator';

export class QueryExchangeRateHistoryDto {
  @IsOptional()
  @IsString()
  pair?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
