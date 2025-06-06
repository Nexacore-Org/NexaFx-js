import { IsOptional, IsEnum, IsBoolean, IsDateString, IsString, IsInt, Min } from "class-validator"
import { IpType, IpStatus } from "../entities/admin-ip-whitelist.entity"
import { AccessResult, AccessType } from "../entities/admin-ip-access-log.entity"
import { Transform } from "class-transformer"

export class AdminIpWhitelistQueryDto {
  @IsOptional()
  @IsEnum(IpType)
  ipType?: IpType

  @IsOptional()
  @IsEnum(IpStatus)
  status?: IpStatus

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  isActive?: boolean

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  isExpired?: boolean

  @IsOptional()
  @IsString()
  search?: string

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

export class AdminIpAccessLogQueryDto {
  @IsOptional()
  @IsString()
  ipAddress?: string

  @IsOptional()
  @IsEnum(AccessResult)
  accessResult?: AccessResult

  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType

  @IsOptional()
  @IsString()
  requestPath?: string

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
