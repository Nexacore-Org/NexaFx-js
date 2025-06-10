export interface CsrfTokenData {
  timestamp: number
  randomValue: string
  signature: string
}

export interface CsrfConfig {
  enabled: boolean
  tokenExpiry: number
  secretLength: number
  exemptRoutes: string[]
  exemptMethods: string[]
}

export interface CsrfValidationResult {
  valid: boolean
  reason?: string
  tokenAge?: number
}

export interface CsrfStats {
  totalTokensGenerated: number
  totalValidations: number
  validationFailures: number
  successRate: number
  recentFailures: CsrfFailure[]
}

export interface CsrfFailure {
  timestamp: Date
  ip: string
  userAgent: string
  url: string
  method: string
  reason: string
}
