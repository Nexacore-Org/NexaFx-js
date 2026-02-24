import { IsOptional, IsString, IsUUID, IsNumber, IsBoolean, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ReviewStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
}

export interface RiskFactor {
  rule: string;
  score: number;
  description: string;
  metadata?: Record<string, any>;
}

export class EvaluateRiskDto {
  @IsUUID()
  transactionId: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsBoolean()
  skipAutoProcessing?: boolean;
}

export class RiskEvaluationResultDto {
  transactionId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  isFlagged: boolean;
  flagReason?: string;
  riskFactors: RiskFactor[];
  requiresManualReview: boolean;
  velocityData?: {
    transactionsInLastHour: number;
    totalAmountInLastHour: number;
    transactionsInLastDay: number;
    totalAmountInLastDay: number;
    averageTransactionAmount: number;
  };
  deviceContext?: {
    deviceId?: string;
    isNewDevice: boolean;
    deviceTrustScore?: number;
    lastLoginFromDevice?: Date;
  };
}

export class ReviewFlaggedTransactionDto {
  @IsEnum(ReviewStatus)
  reviewStatus: ReviewStatus;

  @IsOptional()
  @IsString()
  adminNotes?: string;

  @IsOptional()
  @IsBoolean()
  allowAutoProcessing?: boolean;
}

export class SearchFlaggedTransactionsDto {
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsEnum(ReviewStatus)
  reviewStatus?: ReviewStatus;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minRiskScore?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxRiskScore?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;
}

export class RiskRuleConfigDto {
  @IsString()
  ruleName: string;

  @IsBoolean()
  enabled: boolean;

  @IsNumber()
  weight: number;

  @IsOptional()
  @IsNumber()
  threshold?: number;
}

export class UpdateRiskConfigDto {
  @IsOptional()
  @IsNumber()
  highValueThreshold?: number;

  @IsOptional()
  @IsNumber()
  rapidTransferTimeWindow?: number;

  @IsOptional()
  @IsNumber()
  rapidTransferCountThreshold?: number;

  @IsOptional()
  @IsNumber()
  velocityAnomalyMultiplier?: number;

  @IsOptional()
  @IsNumber()
  autoFlagThreshold?: number;

  @IsOptional()
  @IsNumber()
  criticalThreshold?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskRuleConfigDto)
  rules?: RiskRuleConfigDto[];
}

export class FlaggedTransactionResponseDto {
  id: string;
  transactionId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  flagReason?: string;
  reviewStatus: ReviewStatus;
  createdAt: Date;
  transaction: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    description?: string;
    createdAt: Date;
  };
}
