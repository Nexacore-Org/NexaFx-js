import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * Shared by the statement endpoint and the legacy per-user PDF endpoint. The
 * statement endpoint treats `currency`, `from` and `to` as required and
 * returns 400 through the service when they are missing.
 */
export class StatementQueryDto {
  @IsOptional()
  @IsString()
  @Length(3, 10)
  @Matches(/^[A-Za-z]{3,10}$/)
  currency?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['json', 'pdf'])
  format?: 'json' | 'pdf';
}
