import { IsEnum, IsOptional } from 'class-validator';
import { ReportFrequency } from '../entities/scheduled-report.entity';

export class UpdateScheduledReportDto {
  @IsOptional()
  @IsEnum(ReportFrequency)
  frequency?: ReportFrequency;
}
