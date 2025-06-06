import type { IpType } from "../entities/admin-ip-whitelist.entity"
import type { AccessResult, AccessType } from "../entities/admin-ip-access-log.entity"

export interface IpValidationResult {
  isAllowed: boolean
  whitelistEntry?: {
    id: string
    ipAddress: string
    ipType: IpType
    description?: string
    expiresAt?: Date
  }
  denialReason?: string
  metadata?: Record<string, any>
}

export interface IpAccessAttempt {
  ipAddress: string
  accessType: AccessType
  requestPath: string
  requestMethod: string
  userAgent?: string
  referer?: string
  headers?: Record<string, string>
  userId?: string
  metadata?: Record<string, any>
}

export interface AdminIpConfig {
  enableIpWhitelisting: boolean
  allowLocalhost: boolean
  allowPrivateNetworks: boolean
  enableAccessLogging: boolean
  enableGeoLocation: boolean
  maxAccessAttempts: number
  blockDuration: number
  alertOnDeniedAccess: boolean
  alertThreshold: number
}

export interface IpWhitelistStats {
  totalEntries: number
  activeEntries: number
  expiredEntries: number
  blockedEntries: number
  totalAccesses: number
  allowedAccesses: number
  deniedAccesses: number
  uniqueIps: number
  recentAccesses: number
  topAccessedIps: Array<{ ip: string; count: number }>
  accessByResult: Record<AccessResult, number>
}

export interface IpRange {
  start: string
  end: string
}

export interface CidrInfo {
  network: string
  prefix: number
  firstIp: string
  lastIp: string
  totalIps: number
}
