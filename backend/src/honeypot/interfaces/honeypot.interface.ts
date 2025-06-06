export interface HoneypotAlert {
  id: string
  route: string
  ipAddress: string
  threatLevel: string
  timestamp: Date
  userAgent?: string
  description: string
  geolocation?: string
  recommendedAction: string
}

export interface HoneypotConfig {
  enableEmailAlerts: boolean
  enableSlackAlerts: boolean
  enableDashboardAlerts: boolean
  alertThreshold: number
  blockSuspiciousIPs: boolean
  geolocationEnabled: boolean
  fingerprintingEnabled: boolean
}

export interface AccessAttemptAnalysis {
  isBot: boolean
  isSuspicious: boolean
  threatLevel: string
  riskFactors: string[]
  recommendedAction: string
}

export interface HoneypotStats {
  totalAttempts: number
  uniqueIPs: number
  topRoutes: Array<{ route: string; count: number }>
  topUserAgents: Array<{ userAgent: string; count: number }>
  threatLevelDistribution: Record<string, number>
  recentAttempts: number
  blockedIPs: number
}
