import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

export interface SessionRecord {
  id: string;
  userId: string;
  deviceInfo: string;
  ipAddress: string;
  lastActivity: Date;
  createdAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

const MAX_CONCURRENT_SESSIONS = 5;
const REVOCATION_CACHE = new Map<string, number>();
const CACHE_TTL_MS = 5_000;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, SessionRecord>();

  create(
    userId: string,
    deviceInfo: string,
    ipAddress: string,
    ttlMs = 24 * 60 * 60 * 1000,
  ): SessionRecord {
    const activeSessions = this.getActiveSessions(userId);
    if (activeSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const oldest = activeSessions.sort(
        (a, b) => a.lastActivity.getTime() - b.lastActivity.getTime(),
      )[0];
      this.revoke(oldest.id);
      this.logger.log(`Evicted oldest session ${oldest.id} for user ${userId}`);
    }

    const now = new Date();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      userId,
      deviceInfo,
      ipAddress,
      lastActivity: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      revoked: false,
    };

    this.sessions.set(session.id, session);
    this.logger.log(`Session created: ${session.id} for user ${userId}`);
    return session;
  }

  getActiveSessions(userId: string): SessionRecord[] {
    const now = new Date();
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId && !s.revoked && s.expiresAt > now,
    );
  }

  revoke(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.revoked = true;
    REVOCATION_CACHE.set(sessionId, Date.now() + CACHE_TTL_MS);
    this.logger.log(`Session revoked: ${sessionId}`);
  }

  revokeAllExcept(userId: string, currentSessionId: string): number {
    const targets = this.getActiveSessions(userId).filter(
      (s) => s.id !== currentSessionId,
    );
    targets.forEach((s) => this.revoke(s.id));
    return targets.length;
  }

  assertNotRevoked(sessionId: string): void {
    const cachedUntil = REVOCATION_CACHE.get(sessionId);
    if (cachedUntil && Date.now() < cachedUntil) {
      throw new UnauthorizedException('Session has been revoked');
    }
    const session = this.sessions.get(sessionId);
    if (session?.revoked) {
      REVOCATION_CACHE.set(sessionId, Date.now() + CACHE_TTL_MS);
      throw new UnauthorizedException('Session has been revoked');
    }
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.revoked) {
      session.lastActivity = new Date();
    }
  }
}
