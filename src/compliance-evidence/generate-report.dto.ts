import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsUUID,
  IsBoolean,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportType, ExportFormat } from '../enums/report-type.enum';

export class GenerateReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiProperty({ enum: ExportFormat })
  @IsEnum(ExportFormat)
  exportFormat: ExportFormat;

  @ApiPropertyOptional({ description: 'Start date filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Filter by specific user UUID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Only include flagged/suspicious records' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  flaggedOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

export class ReportFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
