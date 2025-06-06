import { IsOptional, IsEnum, IsDateString, IsString, IsInt, Min } from "class-validator"
import { HoneypotThreatLevel, HoneypotAccessType } from "../entities/honeypot-access.entity"
import { Transform } from "class-transformer"

export class HoneypotQueryDto {
  @IsOptional()
  @IsEnum(HoneypotThreatLevel)
  threatLevel?: HoneypotThreatLevel

  @IsOptional()
  @IsEnum(HoneypotAccessType)
  accessType?: HoneypotAccessType

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
