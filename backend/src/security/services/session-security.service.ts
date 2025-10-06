import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export interface DeviceInfo {
  id: string;
  userId: string;
  sessionId: string;
  ip: string;
  userAgent: string;
  platform?: string;
  browser?: string;
  os?: string;
  createdAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

@Injectable()
export class SessionSecurityService {
  private readonly logger = new Logger(SessionSecurityService.name);
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  private readonly SESSION_PREFIX = 'session:';

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async trackSession(
    userId: string,
    sessionId: string,
    ip: string,
    userAgent: string,
  ): Promise<DeviceInfo> {
    try {
      const deviceInfo: DeviceInfo = {
        id: this.generateDeviceId(),
        userId,
        sessionId,
        ip,
        userAgent,
        platform: this.extractPlatform(userAgent),
        browser: this.extractBrowser(userAgent),
        os: this.extractOS(userAgent),
        createdAt: new Date(),
        lastActivityAt: new Date(),
        isActive: true,
      };

      await this.redis.set(
        `${this.SESSION_PREFIX}${sessionId}`,
        JSON.stringify(deviceInfo),
      );

      await this.redis.sadd(`${this.USER_SESSIONS_PREFIX}${userId}`, sessionId);

      await this.redis.expire(`${this.SESSION_PREFIX}${sessionId}`, 86400);

      return deviceInfo;
    } catch (err) {
      this.logger.error('Error tracking session:', err);
      throw err;
    }
  }

  async getUserSessions(userId: string): Promise<DeviceInfo[]> {
    try {
      const sessionIds = await this.redis.smembers(
        `${this.USER_SESSIONS_PREFIX}${userId}`,
      );

      const sessions: DeviceInfo[] = [];

      for (const sessionId of sessionIds) {
        const data = await this.redis.get(`${this.SESSION_PREFIX}${sessionId}`);
        if (data) {
          sessions.push(JSON.parse(data) as DeviceInfo);
        }
      }

      return sessions.filter((s) => s.isActive);
    } catch (err) {
      this.logger.error(`Error getting sessions for user ${userId}:`, err);
      return [];
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    try {
      const data = await this.redis.get(`${this.SESSION_PREFIX}${sessionId}`);

      if (!data) {
        return;
      }

      const deviceInfo = JSON.parse(data) as DeviceInfo;
      deviceInfo.isActive = false;

      await this.redis.set(
        `${this.SESSION_PREFIX}${sessionId}`,
        JSON.stringify(deviceInfo),
      );

      await this.redis.srem(
        `${this.USER_SESSIONS_PREFIX}${deviceInfo.userId}`,
        sessionId,
      );

      this.logger.log(`Session ${sessionId} revoked`);
    } catch (err) {
      this.logger.error(`Error revoking session ${sessionId}:`, err);
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    try {
      const sessions = await this.getUserSessions(userId);

      for (const session of sessions) {
        await this.revokeSession(session.sessionId);
      }

      this.logger.log(`All sessions revoked for user ${userId}`);
    } catch (err) {
      this.logger.error(`Error revoking all sessions for user ${userId}:`, err);
    }
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const data = await this.redis.get(`${this.SESSION_PREFIX}${sessionId}`);

      if (data) {
        const deviceInfo = JSON.parse(data) as DeviceInfo;
        deviceInfo.lastActivityAt = new Date();

        await this.redis.set(
          `${this.SESSION_PREFIX}${sessionId}`,
          JSON.stringify(deviceInfo),
        );
      }
    } catch (err) {
      this.logger.error('Error updating session activity:', err);
    }
  }

  private generateDeviceId(): string {
    return `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractPlatform(userAgent: string): string {
    if (/mobile/i.test(userAgent)) return 'Mobile';
    if (/tablet/i.test(userAgent)) return 'Tablet';
    return 'Desktop';
  }

  private extractBrowser(userAgent: string): string {
    if (/chrome/i.test(userAgent)) return 'Chrome';
    if (/firefox/i.test(userAgent)) return 'Firefox';
    if (/safari/i.test(userAgent)) return 'Safari';
    if (/edge/i.test(userAgent)) return 'Edge';
    return 'Unknown';
  }

  private extractOS(userAgent: string): string {
    if (/windows/i.test(userAgent)) return 'Windows';
    if (/mac/i.test(userAgent)) return 'MacOS';
    if (/linux/i.test(userAgent)) return 'Linux';
    if (/android/i.test(userAgent)) return 'Android';
    if (/ios|iphone|ipad/i.test(userAgent)) return 'iOS';
    return 'Unknown';
  }
}
