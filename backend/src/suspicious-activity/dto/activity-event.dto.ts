import { IsEnum, IsString, IsOptional, IsObject, IsUUID, IsIP, ValidateNested } from "class-validator"
import { ActivityType } from "../entities/suspicious-activity.entity"
import { Type } from "class-transformer"

export class ActivityMetadataDto {
  @IsOptional()
  @IsString()
  resourceId?: string

  @IsOptional()
  @IsString()
  action?: string

  @IsOptional()
  @IsString()
  target?: string

  @IsOptional()
  @IsString()
  result?: string

  @IsOptional()
  @IsObject()
  details?: Record<string, any>
}

export class ActivityEventDto {
  @IsEnum(ActivityType)
  activityType: ActivityType

  @IsOptional()
  @IsUUID()
  userId?: string

  @IsIP()
  ipAddress: string

  @IsOptional()
  @IsString()
  userAgent?: string

  @IsOptional()
  @IsString()
  deviceFingerprint?: string

  @IsOptional()
  @IsString()
  geolocation?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ActivityMetadataDto)
  metadata?: ActivityMetadataDto
}
