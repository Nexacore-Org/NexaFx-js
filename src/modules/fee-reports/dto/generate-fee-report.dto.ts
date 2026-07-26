import { IsEnum, IsOptional, IsDateString, Type } from 'class-validator';
import { Type as TransformType } from 'class-transformer';

export class GenerateFeeReportDto {
  @IsEnum(['daily', 'weekly', 'monthly'])
  period: 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
