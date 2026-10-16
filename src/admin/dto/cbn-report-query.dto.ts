import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const CBN_REPORT_PERIODS = ['monthly', 'quarterly'] as const;
export type CbnReportPeriod = (typeof CBN_REPORT_PERIODS)[number];

export class CbnReportQueryDto {
  @ApiPropertyOptional({ enum: CBN_REPORT_PERIODS, default: 'monthly' })
  @IsOptional()
  @IsIn(CBN_REPORT_PERIODS)
  period?: CbnReportPeriod;

  @ApiPropertyOptional({
    description: 'ISO date the reporting window starts on (UTC). Defaults to the start of the current month/quarter.',
  })
  @IsOptional()
  @IsDateString()
  periodStart?: string;
}
