import { Injectable } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import { createHash } from "crypto"
import type { SessionData, CreateSessionOptions } from "../session.service"

export interface SecurityAlert {
  type: "ip_mismatch" | "user_agent_mismatch" | "suspicious_activity" | "concurrent_sessions"
  sessionId: string
  userId: string
  timestamp: number
  details: Record<string, any>
}

@Injectable()
export class SessionSecurityService {
  private readonly maxConcurrentSessions: number
  private readonly allowIpChange: boolean
  private readonly allowUserAgentChange: boolean

  constructor(private readonly configService: ConfigService) {
    this.maxConcurrentSessions = this.configService.get<number>("SESSION_MAX_CONCURRENT", 3)
    this.allowIpChange = this.configService.get<boolean>("SESSION_ALLOW_IP_CHANGE", false)
    this.allowUserAgentChange = this.configService.get<boolean>("SESSION_ALLOW_USER_AGENT_CHANGE", true)
  }

  async validateSessionCreation(options: CreateSessionOptions): Promise<void> {
    // Check for suspicious patterns
    await this.checkSuspiciousActivity(options)

    // Validate device fingerprint if available
    if (options.deviceInfo?.fingerprint) {
      await this.validateDeviceFingerprint(options.deviceInfo.fingerprint, options.userId)
    }
  }

  async validateSessionSecurity(session: SessionData, ipAddress: string, userAgent: string): Promise<boolean> {
    // Check IP address change
    if (!this.allowIpChange && session.ipAddress !== ipAddress) {
      await this.createSecurityAlert({
        type: "ip_mismatch",
        sessionId: session.sessionId,
        userId: session.userId,
        timestamp: Date.now(),
        details: {
          originalIp: session.ipAddress,
          newIp: ipAddress,
        },
      })
      return false
    }

    // Check user agent change
    if (!this.allowUserAgentChange && session.userAgent !== userAgent) {
      await this.createSecurityAlert({
        type: "user_agent_mismatch",
        sessionId: session.sessionId,
        userId: session.userId,
        timestamp: Date.now(),
        details: {
          originalUserAgent: session.userAgent,
          newUserAgent: userAgent,
        },
      })
      return false
    }

    return true
  }

  async handleSuspiciousActivity(
    session: SessionData,
    activityType: string,
    details: Record<string, any>,
  ): Promise<void> {
    await this.createSecurityAlert({
      type: "suspicious_activity",
      sessionId: session.sessionId,
      userId: session.userId,
      timestamp: Date.now(),
      details: {
        activityType,
        ...details,
      },
    })

    // Log suspicious activity
    console.warn(`Suspicious activity detected for session ${session.sessionId}:`, {
      userId: session.userId,
      activityType,
      details,
    })
  }

  private async checkSuspiciousActivity(options: CreateSessionOptions): Promise<void> {
    // Check for rapid session creation from same IP
    // Check for unusual user agent patterns
    // Check for known malicious IPs
    // This would integrate with threat intelligence services

    const suspiciousUserAgents = [/bot/i, /crawler/i, /spider/i, /scraper/i]

    for (const pattern of suspiciousUserAgents) {
      if (pattern.test(options.userAgent)) {
        throw new Error("Suspicious user agent detected")
      }
    }
  }

  private async validateDeviceFingerprint(fingerprint: string, userId: string): Promise<void> {
    // Validate device fingerprint consistency
    // Check against known device fingerprints for the user
    // This would help detect device spoofing attempts
  }

  private async createSecurityAlert(alert: SecurityAlert): Promise<void> {
    // Store security alert in database or send to monitoring system
    console.log("Security Alert:", alert)

    // In a real implementation, you might:
    // - Store in database
    // - Send to SIEM system
    // - Trigger automated responses
    // - Notify security team
  }

  generateDeviceFingerprint(userAgent: string, ipAddress: string, additionalData?: Record<string, any>): string {
    const data = {
      userAgent,
      ipAddress,
      ...additionalData,
    }

    return createHash("sha256").update(JSON.stringify(data)).digest("hex")
  }
}
