import { IsOptional, IsEnum, IsDateString, IsUUID, IsBoolean, IsInt, Min, IsString } from "class-validator"
import { ActivityType, SeverityLevel } from "../entities/suspicious-activity.entity"
import { Transform } from "class-transformer"

export class ActivityQueryDto {
  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType

  @IsOptional()
  @IsEnum(SeverityLevel)
  severityLevel?: SeverityLevel

  @IsOptional()
  @IsUUID()
  userId?: string

  @IsOptional()
  @IsString()
  ipAddress?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  resolved?: boolean

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit?: number = 100

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number = 0
}
