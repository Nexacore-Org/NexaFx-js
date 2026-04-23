import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export const TTL = {
  BALANCE: 5,
  SESSION: 5,
  PERMISSION: 60,
  FX_RATE: 30,
  FEATURE_FLAG: 60,
} as const;

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
  redis.call('EXPIRE', key, window / 1000)
  return 1
end
return 0
`;

@Injectable()
export class CacheService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async onApplicationBootstrap() {
    await this.warmCache();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return (await this.cache.get<T>(key)) ?? null;
    } catch (err) {
      this.logger.warn(`Cache GET failed for key "${key}": ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache SET failed for key "${key}": ${err.message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (err) {
      this.logger.warn(`Cache DEL failed for key "${key}": ${err.message}`);
    }
  }

  // ─── Domain helpers ───────────────────────────────────────────────────────

  balanceKey(walletId: string) {
    return `balance:${walletId}`;
  }

  sessionKey(tokenHash: string) {
    return `session:revoked:${tokenHash}`;
  }

  permissionKey(userId: string) {
    return `permission:${userId}`;
  }

  fxRateKey(pair: string) {
    return `fx:rates:${pair}`;
  }

  featureFlagKey(name: string) {
    return `feature:flag:${name}`;
  }

  // ─── Session revocation ───────────────────────────────────────────────────

  async isSessionRevoked(tokenHash: string): Promise<boolean | null> {
    return this.get<boolean>(this.sessionKey(tokenHash));
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.set(this.sessionKey(tokenHash), true, TTL.SESSION);
  }

  // ─── Permission cache ─────────────────────────────────────────────────────

  async getPermissions(userId: string): Promise<string[] | null> {
    return this.get<string[]>(this.permissionKey(userId));
  }

  async setPermissions(userId: string, permissions: string[]): Promise<void> {
    await this.set(this.permissionKey(userId), permissions, TTL.PERMISSION);
  }

  async invalidatePermissions(userId: string): Promise<void> {
    await this.del(this.permissionKey(userId));
  }

  // ─── Rate limit (sliding window via Lua) ─────────────────────────────────

  async checkRateLimit(
    identifier: string,
    windowMs: number,
    limit: number,
  ): Promise<boolean> {
    try {
      const client = (this.cache as any).store?.getClient?.();
      if (!client) return true; // degrade gracefully

      const now = Date.now();
      const key = `ratelimit:${identifier}`;
      const result = await client.eval(SLIDING_WINDOW_LUA, 1, key, now, windowMs, limit);
      return result === 1;
    } catch (err) {
      this.logger.warn(`Rate limit check failed: ${err.message}`);
      return true; // allow on degradation
    }
  }

  // ─── Cache warming ────────────────────────────────────────────────────────

  private async warmCache(): Promise<void> {
    try {
      // Warm FX rates placeholder — real data would come from FxAggregatorService
      const pairs = ['EURUSD', 'GBPUSD', 'USDJPY'];
      for (const pair of pairs) {
        const existing = await this.get(this.fxRateKey(pair));
        if (!existing) {
          await this.set(this.fxRateKey(pair), { pair, rate: null, warmed: true }, TTL.FX_RATE);
        }
      }
      this.logger.log('Cache warming complete');
    } catch (err) {
      this.logger.warn(`Cache warming failed (non-fatal): ${err.message}`);
    }
  }
}
