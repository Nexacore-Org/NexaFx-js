import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconciliationStatus } from '../entities/reconciliation-issue.entity';

export class ReconciliationIssueQueryDto {
  @IsOptional()
  @IsEnum(['OPEN', 'AUTO_RESOLVED', 'ESCALATED'])
  status?: ReconciliationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
