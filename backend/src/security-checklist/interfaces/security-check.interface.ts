import type {
  SecurityCheckStatus,
  SecurityCheckCategory,
  SecurityCheckSeverity,
} from "../entities/security-check.entity"

export interface SecurityCheckResult {
  id: string
  name: string
  description: string
  category: SecurityCheckCategory
  severity: SecurityCheckSeverity
  status: SecurityCheckStatus
  currentValue?: string
  expectedValue?: string
  recommendation?: string
  remediation?: string
  metadata?: Record<string, any>
}

export interface SecurityChecklistReport {
  summary: {
    totalChecks: number
    passedChecks: number
    failedChecks: number
    warningChecks: number
    notApplicableChecks: number
    overallScore: number
    riskLevel: string
  }
  categories: {
    [key in SecurityCheckCategory]: {
      totalChecks: number
      passedChecks: number
      failedChecks: number
      warningChecks: number
      score: number
    }
  }
  checks: SecurityCheckResult[]
  recommendations: string[]
  criticalIssues: SecurityCheckResult[]
  generatedAt: Date
}

export interface EnvironmentConfig {
  nodeEnv: string
  port: number
  httpsEnabled: boolean
  corsEnabled: boolean
  corsOrigins: string[]
  rateLimitEnabled: boolean
  rateLimitMax: number
  rateLimitWindowMs: number
  jwtSecret: string
  databaseUrl: string
  logLevel: string
  sessionSecret: string
  cookieSecure: boolean
  cookieHttpOnly: boolean
  cookieSameSite: string
  helmetEnabled: boolean
  compressionEnabled: boolean
  trustProxy: boolean
}
