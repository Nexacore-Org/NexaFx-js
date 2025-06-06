import { IsString, IsOptional, IsObject, IsIP, IsEnum, IsBoolean, IsNumber, IsArray } from "class-validator"
import { DeviceStatus } from "../entities/device.entity"
import { SessionType } from "../entities/device-session.entity"

export class CreateDeviceFingerprintDto {
  @IsString()
  userAgent: string

  @IsIP()
  ipAddress: string

  @IsOptional()
  @IsString()
  acceptLanguage?: string

  @IsOptional()
  @IsString()
  acceptEncoding?: string

  @IsOptional()
  @IsString()
  timezone?: string

  @IsOptional()
  @IsString()
  screenResolution?: string

  @IsOptional()
  @IsNumber()
  colorDepth?: number

  @IsOptional()
  @IsString()
  platform?: string

  @IsOptional()
  @IsBoolean()
  cookieEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  doNotTrack?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  plugins?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fonts?: string[]

  @IsOptional()
  @IsString()
  canvas?: string

  @IsOptional()
  @IsString()
  webgl?: string

  @IsOptional()
  @IsString()
  audioContext?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}

export class CreateSessionDto {
  @IsString()
  sessionToken: string

  @IsEnum(SessionType)
  sessionType: SessionType

  @IsIP()
  ipAddress: string

  @IsOptional()
  @IsString()
  location?: string

  @IsString()
  userAgent: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus

  @IsOptional()
  @IsBoolean()
  isTrusted?: boolean

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean

  @IsOptional()
  @IsString()
  blockReason?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}
