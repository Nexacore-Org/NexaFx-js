import { IsOptional, IsEnum, IsBoolean } from "class-validator"
import { SecurityCheckCategory, SecurityCheckSeverity } from "../entities/security-check.entity"

export class SecurityChecklistQueryDto {
  @IsOptional()
  @IsEnum(SecurityCheckCategory)
  category?: SecurityCheckCategory

  @IsOptional()
  @IsEnum(SecurityCheckSeverity)
  severity?: SecurityCheckSeverity

  @IsOptional()
  @IsBoolean()
  failedOnly?: boolean

  @IsOptional()
  @IsBoolean()
  includeRecommendations?: boolean
}
