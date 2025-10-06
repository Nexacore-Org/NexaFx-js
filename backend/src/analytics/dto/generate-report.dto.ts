import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ReportFormat } from '../entities/report.entity';

export class GenerateReportDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
  
  @IsEnum(ReportFormat)
  format: ReportFormat;
  
  // Add other filters like date ranges if needed
}