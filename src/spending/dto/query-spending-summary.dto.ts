import { IsOptional, IsIn, IsDateString } from 'class-validator';

export class QuerySpendingSummaryDto {
  @IsOptional()
  @IsIn(['week', 'month', 'year'])
  period?: 'week' | 'month' | 'year' = 'month';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
