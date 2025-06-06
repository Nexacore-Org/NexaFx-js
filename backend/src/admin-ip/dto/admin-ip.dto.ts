import { IsString, IsOptional, IsEnum, IsBoolean, IsDateString, IsObject, IsIP } from "class-validator"
import { IpType, IpStatus } from "../entities/admin-ip-whitelist.entity"

export class CreateAdminIpWhitelistDto {
  @IsString()
  ipAddress: string

  @IsEnum(IpType)
  ipType: IpType

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(IpStatus)
  status?: IpStatus

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsDateString()
  expiresAt?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}

export class UpdateAdminIpWhitelistDto {
  @IsOptional()
  @IsString()
  ipAddress?: string

  @IsOptional()
  @IsEnum(IpType)
  ipType?: IpType

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(IpStatus)
  status?: IpStatus

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsDateString()
  expiresAt?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}

export class BulkAddIpsDto {
  @IsString({ each: true })
  ipAddresses: string[]

  @IsEnum(IpType)
  ipType: IpType

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  expiresAt?: string
}

export class IpAccessTestDto {
  @IsIP()
  ipAddress: string

  @IsOptional()
  @IsString()
  userAgent?: string

  @IsOptional()
  @IsString()
  requestPath?: string
}
