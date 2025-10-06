import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { IpBlockService } from './ip-block.service';
import { SecurityEventsService } from './security-events.service';

export interface LoginAttempt {
  ip: string;
  userId?: string;
  success: boolean;
  timestamp: Date;
  userAgent?: string;
}

@Injectable()
export class BruteForceService {
  private readonly logger = new Logger(BruteForceService.name);
  private readonly LOGIN_ATTEMPTS_PREFIX = 'login_attempts:';
  private readonly ATTEMPT_WINDOW = 900; // 15 minutes
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly ipBlockService: IpBlockService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async recordLoginAttempt(
    ip: string,
    userId?: string,
    success: boolean = false,
    userAgent?: string,
  ): Promise<void> {
    try {
      const attempt: LoginAttempt = {
        ip,
        userId,
        success,
        timestamp: new Date(),
        userAgent,
      };

      const key = `${this.LOGIN_ATTEMPTS_PREFIX}${ip}`;
      await this.redis.lpush(key, JSON.stringify(attempt));
      await this.redis.expire(key, this.ATTEMPT_WINDOW);

      if (!success) {
        await this.checkAndBlock(ip, userId);
      }

      await this.securityEventsService.logEvent({
        type: success ? 'login_success' : 'login_failed',
        ip,
        userId,
        description: success ? 'Successful login' : 'Failed login attempt',
        severity: success ? 'low' : 'medium',
        metadata: { userAgent },
      });
    } catch (err) {
      this.logger.error('Error recording login attempt:', err);
    }
  }

  async getLoginAttempts(identifier: string): Promise<LoginAttempt[]> {
    try {
      const key = `${this.LOGIN_ATTEMPTS_PREFIX}${identifier}`;
      const attempts = await this.redis.lrange(key, 0, -1);
      return attempts.map((a) => JSON.parse(a) as LoginAttempt);
    } catch (err) {
      this.logger.error(`Error getting login attempts for ${identifier}:`, err);
      return [];
    }
  }

  async getFailedAttemptsCount(ip: string): Promise<number> {
    try {
      const attempts = await this.getLoginAttempts(ip);
      return attempts.filter((a) => !a.success).length;
    } catch (err) {
      this.logger.error(`Error getting failed attempts count for ${ip}:`, err);
      return 0;
    }
  }

  async resetAttempts(identifier: string): Promise<void> {
    try {
      const key = `${this.LOGIN_ATTEMPTS_PREFIX}${identifier}`;
      await this.redis.del(key);
      this.logger.log(`Login attempts reset for ${identifier}`);
    } catch (err) {
      this.logger.error(`Error resetting attempts for ${identifier}:`, err);
    }
  }

  private async checkAndBlock(ip: string, userId?: string): Promise<void> {
    const failedCount = await this.getFailedAttemptsCount(ip);

    if (failedCount >= this.MAX_ATTEMPTS) {
      await this.ipBlockService.blockIP(
        ip,
        `Brute force detected: ${failedCount} failed login attempts`,
        3600, // 1 hour
        true,
      );

      await this.securityEventsService.logEvent({
        type: 'brute_force_detected',
        ip,
        userId,
        description: `IP blocked after ${failedCount} failed login attempts`,
        severity: 'high',
      });

      this.logger.warn(`IP ${ip} blocked due to brute force attempts`);
    }
  }

  async isUnderBruteForceAttack(ip: string): Promise<boolean> {
    const failedCount = await this.getFailedAttemptsCount(ip);
    return failedCount >= this.MAX_ATTEMPTS - 1;
  }
}
