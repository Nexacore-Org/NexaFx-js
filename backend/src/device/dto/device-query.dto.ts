import { IsOptional, IsEnum, IsUUID, IsBoolean, IsDateString, IsInt, Min, IsString } from "class-validator"
import { DeviceType, DeviceStatus, OperatingSystem, Browser } from "../entities/device.entity"
import { SessionStatus } from "../entities/device-session.entity"
import { AnomalyType, AnomalySeverity } from "../entities/device-anomaly.entity"
import { Transform } from "class-transformer"

export class DeviceQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string

  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType

  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus

  @IsOptional()
  @IsEnum(OperatingSystem)
  operatingSystem?: OperatingSystem

  @IsOptional()
  @IsEnum(Browser)
  browser?: Browser

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  isTrusted?: boolean

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  isBlocked?: boolean

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

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

export class SessionQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string

  @IsOptional()
  @IsUUID()
  deviceId?: string

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus

  @IsOptional()
  @IsString()
  ipAddress?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  isAnomalous?: boolean

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

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

export class AnomalyQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string

  @IsOptional()
  @IsUUID()
  deviceId?: string

  @IsOptional()
  @IsEnum(AnomalyType)
  anomalyType?: AnomalyType

  @IsOptional()
  @IsEnum(AnomalySeverity)
  severity?: AnomalySeverity

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  resolved?: boolean

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

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
