import { Injectable, UnauthorizedException } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import { randomBytes } from "crypto"
import type { SessionStorage } from "./storage/session.storage"
import type { SessionSecurityService } from "./services/session-security.service"

export interface SessionData {
  sessionId: string
  userId: string
  username?: string
  email?: string
  roles?: string[]
  permissions?: string[]
  createdAt: number
  lastAccessedAt: number
  expiresAt: number
  ipAddress: string
  userAgent: string
  deviceInfo?: DeviceInfo
  isActive: boolean
  metadata?: Record<string, any>
}

export interface DeviceInfo {
  type: "desktop" | "mobile" | "tablet" | "unknown"
  os: string
  browser: string
  fingerprint: string
}

export interface CreateSessionOptions {
  userId: string
  username?: string
  email?: string
  roles?: string[]
  permissions?: string[]
  ipAddress: string
  userAgent: string
  rememberMe?: boolean
  deviceInfo?: DeviceInfo
  metadata?: Record<string, any>
}

export interface SessionSummary {
  sessionId: string
  createdAt: number
  lastAccessedAt: number
  ipAddress: string
  deviceInfo?: DeviceInfo
  isActive: boolean
  isCurrent?: boolean
}

@Injectable()
export class SessionService {
  private readonly defaultSessionTtl: number
  private readonly rememberMeSessionTtl: number
  private readonly maxSessionsPerUser: number
  private readonly inactivityTimeout: number

  constructor(
    private readonly storage: SessionStorage,
    private readonly configService: ConfigService,
    private readonly securityService: SessionSecurityService,
  ) {
    this.defaultSessionTtl = this.configService.get<number>("SESSION_TTL", 24 * 60 * 60 * 1000) // 24 hours
    this.rememberMeSessionTtl = this.configService.get<number>("SESSION_REMEMBER_ME_TTL", 30 * 24 * 60 * 60 * 1000) // 30 days
    this.maxSessionsPerUser = this.configService.get<number>("SESSION_MAX_PER_USER", 5)
    this.inactivityTimeout = this.configService.get<number>("SESSION_INACTIVITY_TIMEOUT", 30 * 60 * 1000) // 30 minutes
  }

  async createSession(options: CreateSessionOptions): Promise<SessionData> {
    const sessionId = this.generateSessionId()
    const now = Date.now()
    const ttl = options.rememberMe ? this.rememberMeSessionTtl : this.defaultSessionTtl

    // Check for suspicious activity
    await this.securityService.validateSessionCreation(options)

    // Enforce session limits per user
    await this.enforceSessionLimits(options.userId)

    const sessionData: SessionData = {
      sessionId,
      userId: options.userId,
      username: options.username,
      email: options.email,
      roles: options.roles || [],
      permissions: options.permissions || [],
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + ttl,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      deviceInfo: options.deviceInfo,
      isActive: true,
      metadata: options.metadata || {},
    }

    await this.storage.createSession(sessionData)

    // Log session creation
    console.log(`Session created for user ${options.userId}: ${sessionId}`)

    return sessionData
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!sessionId || !this.isValidSessionId(sessionId)) {
      return null
    }

    const session = await this.storage.getSession(sessionId)
    if (!session) {
      return null
    }

    // Check if session is expired
    if (this.isSessionExpired(session)) {
      await this.invalidateSession(sessionId)
      return null
    }

    // Check for inactivity timeout
    if (this.isSessionInactive(session)) {
      await this.invalidateSession(sessionId, "inactivity")
      return null
    }

    return session
  }

  async refreshSession(sessionId: string, ipAddress?: string, userAgent?: string): Promise<SessionData | null> {
    const session = await this.getSession(sessionId)
    if (!session) {
      throw new UnauthorizedException("Invalid session")
    }

    // Security check: validate IP and user agent if provided
    if (ipAddress && session.ipAddress !== ipAddress) {
      await this.securityService.handleSuspiciousActivity(session, "ip_mismatch", {
        originalIp: session.ipAddress,
        newIp: ipAddress,
      })
    }

    if (userAgent && session.userAgent !== userAgent) {
      await this.securityService.handleSuspiciousActivity(session, "user_agent_mismatch", {
        originalUserAgent: session.userAgent,
        newUserAgent: userAgent,
      })
    }

    // Update last accessed time
    const now = Date.now()
    session.lastAccessedAt = now

    // Extend expiration if needed (sliding session)
    const timeUntilExpiry = session.expiresAt - now
    const halfTtl = (session.expiresAt - session.createdAt) / 2

    if (timeUntilExpiry < halfTtl) {
      session.expiresAt = now + (session.expiresAt - session.createdAt)
    }

    await this.storage.updateSession(session)
    return session
  }

  async invalidateSession(sessionId: string, reason = "manual"): Promise<void> {
    const session = await this.storage.getSession(sessionId)
    if (session) {
      session.isActive = false
      await this.storage.updateSession(session)
      console.log(`Session invalidated: ${sessionId}, reason: ${reason}`)
    }

    await this.storage.deleteSession(sessionId)
  }

  async invalidateAllUserSessions(userId: string, excludeSessionId?: string): Promise<number> {
    const sessions = await this.storage.getUserSessions(userId)
    let invalidatedCount = 0

    for (const session of sessions) {
      if (session.sessionId !== excludeSessionId) {
        await this.invalidateSession(session.sessionId, "user_logout_all")
        invalidatedCount++
      }
    }

    return invalidatedCount
  }

  async getUserSessions(userId: string): Promise<SessionSummary[]> {
    const sessions = await this.storage.getUserSessions(userId)

    return sessions
      .filter((session) => session.isActive && !this.isSessionExpired(session))
      .map((session) => ({
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        lastAccessedAt: session.lastAccessedAt,
        ipAddress: session.ipAddress,
        deviceInfo: session.deviceInfo,
        isActive: session.isActive,
      }))
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
  }

  async getActiveSessionsCount(): Promise<number> {
    return await this.storage.getActiveSessionsCount()
  }

  async getSessionStatistics(timeRange: number = 24 * 60 * 60 * 1000): Promise<{
    totalSessions: number
    activeSessions: number
    expiredSessions: number
    invalidatedSessions: number
    averageSessionDuration: number
    topUserAgents: Array<{ userAgent: string; count: number }>
    topIpAddresses: Array<{ ipAddress: string; count: number }>
  }> {
    const now = Date.now()
    const since = now - timeRange

    return await this.storage.getSessionStatistics(since, now)
  }

  async cleanupExpiredSessions(): Promise<number> {
    const expiredSessions = await this.storage.getExpiredSessions()
    let cleanedCount = 0

    for (const session of expiredSessions) {
      await this.storage.deleteSession(session.sessionId)
      cleanedCount++
    }

    console.log(`Cleaned up ${cleanedCount} expired sessions`)
    return cleanedCount
  }

  async validateSessionSecurity(sessionId: string, ipAddress: string, userAgent: string): Promise<boolean> {
    const session = await this.getSession(sessionId)
    if (!session) {
      return false
    }

    return await this.securityService.validateSessionSecurity(session, ipAddress, userAgent)
  }

  async extendSession(sessionId: string, additionalTime: number): Promise<SessionData | null> {
    const session = await this.getSession(sessionId)
    if (!session) {
      return null
    }

    session.expiresAt += additionalTime
    await this.storage.updateSession(session)

    return session
  }

  async updateSessionMetadata(sessionId: string, metadata: Record<string, any>): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) {
      throw new UnauthorizedException("Invalid session")
    }

    session.metadata = { ...session.metadata, ...metadata }
    await this.storage.updateSession(session)
  }

  private generateSessionId(): string {
    return randomBytes(32).toString("hex")
  }

  private isValidSessionId(sessionId: string): boolean {
    return /^[a-f0-9]{64}$/.test(sessionId)
  }

  private isSessionExpired(session: SessionData): boolean {
    return Date.now() > session.expiresAt
  }

  private isSessionInactive(session: SessionData): boolean {
    return Date.now() - session.lastAccessedAt > this.inactivityTimeout
  }

  private async enforceSessionLimits(userId: string): Promise<void> {
    const userSessions = await this.storage.getUserSessions(userId)
    const activeSessions = userSessions.filter((s) => s.isActive && !this.isSessionExpired(s))

    if (activeSessions.length >= this.maxSessionsPerUser) {
      // Remove oldest sessions
      const sessionsToRemove = activeSessions
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
        .slice(0, activeSessions.length - this.maxSessionsPerUser + 1)

      for (const session of sessionsToRemove) {
        await this.invalidateSession(session.sessionId, "session_limit_exceeded")
      }
    }
  }
}
