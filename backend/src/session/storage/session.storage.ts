import type { SessionData } from "../session.service"

export abstract class SessionStorage {
  abstract createSession(session: SessionData): Promise<void>
  abstract getSession(sessionId: string): Promise<SessionData | null>
  abstract updateSession(session: SessionData): Promise<void>
  abstract deleteSession(sessionId: string): Promise<void>
  abstract getUserSessions(userId: string): Promise<SessionData[]>
  abstract getExpiredSessions(): Promise<SessionData[]>
  abstract getActiveSessionsCount(): Promise<number>
  abstract getSessionStatistics(
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
  }>
}
