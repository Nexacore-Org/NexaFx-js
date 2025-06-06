import type { DeviceType, OperatingSystem, Browser } from "../entities/device.entity"
import type { SessionType } from "../entities/device-session.entity"
import type { AnomalyType, AnomalySeverity } from "../entities/device-anomaly.entity"
import type { Device } from "../entities/device.entity"

export interface DeviceFingerprint {
  userAgent: string
  ipAddress: string
  acceptLanguage?: string
  acceptEncoding?: string
  timezone?: string
  screenResolution?: string
  colorDepth?: number
  platform?: string
  cookieEnabled?: boolean
  doNotTrack?: boolean
  plugins?: string[]
  fonts?: string[]
  canvas?: string
  webgl?: string
  audioContext?: string
}

export interface ParsedUserAgent {
  browser: Browser
  browserVersion: string
  operatingSystem: OperatingSystem
  osVersion: string
  deviceType: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

export interface DeviceInfo {
  fingerprint: string
  name?: string
  deviceType: DeviceType
  operatingSystem: OperatingSystem
  browser: Browser
  browserVersion?: string
  osVersion?: string
  userAgent: string
  ipAddress: string
  location?: string
  capabilities?: Record<string, any>
  metadata?: Record<string, any>
}

export interface SessionInfo {
  sessionToken: string
  sessionType: SessionType
  ipAddress: string
  location?: string
  userAgent: string
  expiresAt?: Date
  metadata?: Record<string, any>
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean
  anomalies: Array<{
    type: AnomalyType
    severity: AnomalySeverity
    description: string
    riskScore: number
    metadata?: Record<string, any>
  }>
  totalRiskScore: number
  recommendedAction: string
}

export interface DeviceStats {
  totalDevices: number
  trustedDevices: number
  pendingDevices: number
  blockedDevices: number
  suspiciousDevices: number
  devicesByType: Record<DeviceType, number>
  devicesByOS: Record<OperatingSystem, number>
  devicesByBrowser: Record<Browser, number>
  recentLogins: number
  anomaliesDetected: number
}

export interface UserDeviceSummary {
  userId: string
  totalDevices: number
  trustedDevices: number
  recentDevices: Device[]
  activeSessions: number
  lastLogin: Date
  riskScore: number
  anomalies: number
}
