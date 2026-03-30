import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Redis-backed sliding window rate limiter using an atomic Lua script.
 * Gracefully degrades to allow-all if Redis is unavailable (logs a warning).
 *
 * Lua script: atomic ZSET-based sliding window
 *   KEYS[1]  = rate-limit key
 *   ARGV[1]  = now (ms)
 *   ARGV[2]  = window size (ms)
 *   ARGV[3]  = limit (max requests)
 * Returns: [allowed (1|0), remaining_or_retryAfterMs]
 */
const SLIDING_WINDOW_LUA = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local cutoff = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = window - (now - tonumber(oldest[2]))
  return {0, retryAfter}
end
`;

export interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

@Injectable()
export class RedisRateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimitService.name);
  private client: any = null;
  private available = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not configured — Redis rate limiting disabled, using DB fallback');
      return;
    }

    try {
      // Dynamic import: app won't crash if ioredis isn't installed
      const { default: Redis } = await import('ioredis');
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        enableOfflineQueue: false,
      });
      this.client.on('error', (err: Error) => {
        if (this.available) this.logger.warn(`Redis error — degrading to DB fallback: ${err.message}`);
        this.available = false;
      });
      this.client.on('ready', () => {
        this.available = true;
        this.logger.log('Redis rate limiter connected');
      });
      await this.client.connect();
    } catch (err: any) {
      this.logger.warn(`Redis init failed — degrading to DB fallback: ${err.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => {});
  }

  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Atomically check-and-increment a sliding window counter.
   * Falls back to allow-all if Redis is unavailable.
   */
  async checkAndIncrement(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<SlidingWindowResult> {
    if (!this.available || !this.client) {
      this.logger.warn(`Redis unavailable — allowing request for key=${key}`);
      return { allowed: true, remaining: limit, retryAfterMs: 0 };
    }

    try {
      const now = Date.now();
      const [allowed, value]: [number, number] = await this.client.eval(
        SLIDING_WINDOW_LUA, 1, key, now, windowMs, limit,
      );
      return {
        allowed: allowed === 1,
        remaining: allowed === 1 ? value : 0,
        retryAfterMs: allowed === 1 ? 0 : value,
      };
    } catch (err: any) {
      this.logger.warn(`Redis eval error — allowing request: ${err.message}`);
      return { allowed: true, remaining: limit, retryAfterMs: 0 };
    }
  }
}
