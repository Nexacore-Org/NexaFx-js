import { IsEnum } from 'class-validator';
import {
  ReportFrequency,
  ReportType,
} from '../entities/scheduled-report.entity';

export class CreateScheduledReportDto {
  @IsEnum(ReportType)
  reportType: ReportType;

  @IsEnum(ReportFrequency)
  frequency: ReportFrequency;
}
