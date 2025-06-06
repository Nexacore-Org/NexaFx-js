import type { ActivityType, SeverityLevel, ActionTaken } from "../entities/suspicious-activity.entity"
import type { RuleType } from "../entities/activity-rule.entity"

export interface ActivityEvent {
  activityType: ActivityType
  userId?: string
  ipAddress: string
  userAgent?: string
  metadata?: Record<string, any>
  timestamp?: Date
  deviceFingerprint?: string
  geolocation?: string
}

export interface RuleEvaluationResult {
  triggered: boolean
  ruleId?: string
  ruleName?: string
  ruleType?: RuleType
  severityLevel?: SeverityLevel
  actions?: ActionTaken[]
  riskScore?: number
  riskFactors?: string[]
}

export interface ActivityAnalysisResult {
  isSuspicious: boolean
  riskScore: number
  riskFactors: string[]
  severityLevel: SeverityLevel
  recommendedActions: ActionTaken[]
  triggeredRules: RuleEvaluationResult[]
}

export interface UserRiskProfile {
  userId: string
  riskScore: number
  lastUpdated: Date
  recentActivities: number
  suspiciousActivities: number
  accountAge: number
  lastLoginAt?: Date
  lastLoginIp?: string
  knownLocations: string[]
  knownDevices: string[]
  riskFactors: string[]
}

export interface SuspiciousActivityAlert {
  id: string
  userId?: string
  activityType: ActivityType
  description: string
  severityLevel: SeverityLevel
  ipAddress: string
  timestamp: Date
  riskScore: number
  riskFactors: string[]
  actionsTaken: ActionTaken[]
  metadata?: Record<string, any>
}

export interface SuspiciousActivityStats {
  totalActivities: number
  unresolvedActivities: number
  criticalActivities: number
  highActivities: number
  mediumActivities: number
  lowActivities: number
  topRiskFactors: Array<{ factor: string; count: number }>
  topIpAddresses: Array<{ ipAddress: string; count: number }>
  activityByType: Record<ActivityType, number>
  recentActivities: number
}
