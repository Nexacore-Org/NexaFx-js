import { Injectable, Logger } from "@nestjs/common";

export interface SessionMetadata {
  sessionId: string;
  userId: string;
  ip: string;
  userAgent: string;
  createdAt: Date;
  deviceId?: string;
}

@Injectable()
export class SessionMetadataService {
  private readonly logger = new Logger(SessionMetadataService.name);
  private sessions: Map<string, SessionMetadata> = new Map();

  createSession(sessionId: string, userId: string, ip: string, userAgent: string, deviceId?: string) {
    const entry: SessionMetadata = {
      sessionId,
      userId,
      ip,
      userAgent,
      createdAt: new Date(),
      deviceId,
    };
    this.sessions.set(sessionId, entry);
    this.logger.log(`Session created: ${sessionId} for user ${userId}`);
  }

  getSession(sessionId: string): SessionMetadata | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(userId: string): SessionMetadata[] {
    return Array.from(this.sessions.values()).filter((s) => s.userId === userId);
  }
}
