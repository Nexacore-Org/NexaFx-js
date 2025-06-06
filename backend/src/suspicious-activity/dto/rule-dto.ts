import { IsEnum, IsString, IsOptional, IsObject, IsInt, IsArray, Min, IsNumber, IsBoolean } from "class-validator"
import { ActivityType, SeverityLevel, ActionTaken } from "../entities/suspicious-activity.entity"
import { RuleType, RuleStatus } from "../entities/activity-rule.entity"

export class CreateRuleDto {
  @IsString()
  name: string

  @IsString()
  description: string

  @IsEnum(RuleType)
  ruleType: RuleType

  @IsArray()
  @IsEnum(ActivityType, { each: true })
  activityTypes: ActivityType[]

  @IsEnum(SeverityLevel)
  severityLevel: SeverityLevel

  @IsArray()
  @IsEnum(ActionTaken, { each: true })
  actions: ActionTaken[]

  @IsObject()
  conditions: Record<string, any>

  @IsInt()
  @Min(0)
  threshold: number

  @IsInt()
  @Min(1)
  timeWindowMinutes: number

  @IsNumber()
  @Min(0)
  riskScoreMultiplier: number

  @IsEnum(RuleStatus)
  status: RuleStatus

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(RuleType)
  ruleType?: RuleType

  @IsOptional()
  @IsArray()
  @IsEnum(ActivityType, { each: true })
  activityTypes?: ActivityType[]

  @IsOptional()
  @IsEnum(SeverityLevel)
  severityLevel?: SeverityLevel

  @IsOptional()
  @IsArray()
  @IsEnum(ActionTaken, { each: true })
  actions?: ActionTaken[]

  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>

  @IsOptional()
  @IsInt()
  @Min(0)
  threshold?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  timeWindowMinutes?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  riskScoreMultiplier?: number

  @IsOptional()
  @IsEnum(RuleStatus)
  status?: RuleStatus

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}
