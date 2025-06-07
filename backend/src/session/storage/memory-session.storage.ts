import { Injectable } from "@nestjs/common"
import { SessionStorage } from "./session.storage"
import type { SessionData } from "../session.service"

@Injectable()
export class MemorySessionStorage extends SessionStorage {
  private readonly sessions = new Map<string, SessionData>()
  private readonly userSessions = new Map<string, Set<string>>()

  async createSession(session: SessionData): Promise<void> {
    this.sessions.set(session.sessionId, { ...session })

    // Track user sessions
    if (!this.userSessions.has(session.userId)) {
      this.userSessions.set(session.userId, new Set())
    }
    this.userSessions.get(session.userId)!.add(session.sessionId)
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId)
    return session ? { ...session } : null
  }

  async updateSession(session: SessionData): Promise<void> {
    if (this.sessions.has(session.sessionId)) {
      this.sessions.set(session.sessionId, { ...session })
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.sessions.delete(sessionId)

      // Remove from user sessions tracking
      const userSessionSet = this.userSessions.get(session.userId)
      if (userSessionSet) {
        userSessionSet.delete(sessionId)
        if (userSessionSet.size === 0) {
          this.userSessions.delete(session.userId)
        }
      }
    }
  }

  async getUserSessions(userId: string): Promise<SessionData[]> {
    const sessionIds = this.userSessions.get(userId)
    if (!sessionIds) {
      return []
    }

    const sessions: SessionData[] = []
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId)
      if (session) {
        sessions.push({ ...session })
      }
    }

    return sessions
  }

  async getExpiredSessions(): Promise<SessionData[]> {
    const now = Date.now()
    const expiredSessions: SessionData[] = []

    for (const session of this.sessions.values()) {
      if (session.expiresAt <= now) {
        expiredSessions.push({ ...session })
      }
    }

    return expiredSessions
  }

  async getActiveSessionsCount(): Promise<number> {
    const now = Date.now()
    let count = 0

    for (const session of this.sessions.values()) {
      if (session.isActive && session.expiresAt > now) {
        count++
      }
    }

    return count
  }

  async getSessionStatistics(
    since: number,
    until: number,
  ): Promise<{
    totalSessions: number
    activeSessions: number
    expiredSessions: number
    invalidatedSessions: number
    averageSessionDuration: number
    topUserAgents: Array<{ userAgent: string; count: number }>
    topIpAddresses: Array<{ ipAddress: string; count: number }>
  }> {
    const now = Date.now()
    let totalSessions = 0
    let activeSessions = 0
    let expiredSessions = 0
    let invalidatedSessions = 0
    let totalDuration = 0
    const userAgentCounts = new Map<string, number>()
    const ipAddressCounts = new Map<string, number>()

    for (const session of this.sessions.values()) {
      if (session.createdAt >= since && session.createdAt <= until) {
        totalSessions++

        if (session.isActive && session.expiresAt > now) {
          activeSessions++
        } else if (session.expiresAt <= now) {
          expiredSessions++
        } else if (!session.isActive) {
          invalidatedSessions++
        }

        // Calculate session duration
        const endTime = session.isActive ? Math.min(now, session.expiresAt) : session.lastAccessedAt
        const duration = endTime - session.createdAt
        totalDuration += duration

        // Count user agents
        const userAgent = session.userAgent || "unknown"
        userAgentCounts.set(userAgent, (userAgentCounts.get(userAgent) || 0) + 1)

        // Count IP addresses
        ipAddressCounts.set(session.ipAddress, (ipAddressCounts.get(session.ipAddress) || 0) + 1)
      }
    }

    const averageSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0

    const topUserAgents = Array.from(userAgentCounts.entries())
      .map(([userAgent, count]) => ({ userAgent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const topIpAddresses = Array.from(ipAddressCounts.entries())
      .map(([ipAddress, count]) => ({ ipAddress, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalSessions,
      activeSessions,
      expiredSessions,
      invalidatedSessions,
      averageSessionDuration,
      topUserAgents,
      topIpAddresses,
    }
  }
}
