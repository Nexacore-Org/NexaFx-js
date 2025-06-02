import { IsEnum, IsOptional, IsUUID, IsString, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditActionType } from './audit-log.entity';

export class CreateAuditLogDto {
  @ApiProperty({ enum: AuditActionType })
  @IsEnum(AuditActionType)
  actionType: AuditActionType;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceType?: string;
}

export class QueryAuditLogsDto {
  @ApiPropertyOptional({ enum: AuditActionType })
  @IsOptional()
  @IsEnum(AuditActionType)
  actionType?: AuditActionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: AuditActionType })
  actionType: AuditActionType;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  userEmail?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  ipAddress?: string;

  @ApiPropertyOptional()
  userAgent?: string;

  @ApiProperty()
  timestamp: Date;

  @ApiPropertyOptional()
  resourceId?: string;

  @ApiPropertyOptional()
  resourceType?: string;
}

export class PaginatedAuditLogsResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data: AuditLogResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}