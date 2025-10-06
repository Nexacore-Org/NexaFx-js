// src/security/services/rate-limit.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  RATE_LIMIT_OPTIONS,
  //   RATE_LIMIT_DEFAULTS,
} from '../constants/rate-limit.constants';
import {
  RateLimitOptions,
  RateLimitTier,
} from '../interfaces/rate-limit-options.interface';
import rateLimiterFlexible from 'rate-limiter-flexible';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis;

  constructor(
    @Inject(RATE_LIMIT_OPTIONS) private readonly options: RateLimitOptions,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis error:', err);
    });
  }

  async consume(key: string, points: number = 1): Promise<boolean> {
    try {
      const rateLimiter = new rateLimiterFlexible.RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: 'ratelimit',
        points: this.options.max,
        duration: this.options.windowMs / 1000, // convert to seconds
      });

      try {
        await rateLimiter.consume(key, points);
        return true;
      } catch {
        return false;
      }
    } catch (err) {
      this.logger.error('Rate limiting error:', err);
      // In case of Redis failure, allow the request to proceed
      return true;
    }
  }

  async getRemainingPoints(key: string): Promise<number> {
    try {
      const rateLimiter = new rateLimiterFlexible.RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: 'ratelimit',
        points: this.options.max,
        duration: this.options.windowMs / 1000,
      });

      const res = await rateLimiter.get(key);
      return res !== null ? res.remainingPoints : this.options.max;
    } catch (err) {
      this.logger.error('Error getting remaining points:', err);
      return this.options.max;
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      const rateLimiter = new rateLimiterFlexible.RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: 'ratelimit',
      });
      await rateLimiter.delete(key);
    } catch (err) {
      this.logger.error('Error resetting rate limit key:', err);
    }
  }

  async configureTier(
    tier: string,
    windowMs: number,
    max: number,
  ): Promise<void> {
    try {
      const configKey = `rate_limit_config:${tier}`;
      const config = {
        tier,
        windowMs,
        max,
        updatedAt: new Date().toISOString(),
      };

      await this.redis.set(configKey, JSON.stringify(config));
      this.logger.log(
        `Rate limit configuration updated for tier ${tier}: ${max} requests per ${windowMs}ms`,
      );
    } catch (err) {
      this.logger.error(`Error configuring tier ${tier}:`, err);
      throw err;
    }
  }

  async getTierConfig(tier: string): Promise<RateLimitTier | null> {
    try {
      const configKey = `rate_limit_config:${tier}`;
      const config = await this.redis.get(configKey);

      if (!config) {
        return null;
      }

      return JSON.parse(config) as RateLimitTier;
    } catch (err) {
      this.logger.error(`Error getting tier config for ${tier}:`, err);
      return null;
    }
  }
}
