import { Injectable, Logger, Optional } from "@nestjs/common";
import { RedisRateLimitService } from "../../../modules/rate-limit/services/redis-rate-limit.service";

export interface TransactionLimitConfig {
  hourlyLimit: number;
}

/**
 * Redis-backed transaction rate limiter.
 * Uses sliding window via RedisRateLimitService.
 * Falls back to allow-all if Redis is unavailable (logs a warning).
 * Limits survive server restart and work across multiple instances.
 */
@Injectable()
export class TransactionLimitService {
  private readonly logger = new Logger(TransactionLimitService.name);

  // Default: 10 transactions per hour per user (configurable via admin API)
  private hourlyLimit = 10;

  constructor(
    @Optional() private readonly redisRateLimit: RedisRateLimitService,
  ) {}

  /**
   * Update the hourly transaction limit at runtime (no restart required).
   */
  setHourlyLimit(limit: number) {
    this.hourlyLimit = limit;
    this.logger.log(`Transaction hourly limit updated to ${limit}`);
  }

  getHourlyLimit(): number {
    return this.hourlyLimit;
  }

  /**
   * Check if a user has exceeded their hourly transaction limit.
   * Returns true if the transaction is allowed, false if rate-limited.
   */
  async checkAndRecord(userId: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
    if (!this.redisRateLimit?.isAvailable()) {
      this.logger.warn(`Redis unavailable — allowing transaction for user=${userId}`);
      return { allowed: true, retryAfterMs: 0 };
    }

    const key = `tx-limit:user:${userId}`;
    const windowMs = 60 * 60 * 1000; // 1 hour

    const result = await this.redisRateLimit.checkAndIncrement(key, this.hourlyLimit, windowMs);

    if (!result.allowed) {
      this.logger.warn(`Transaction limit exceeded for user=${userId}, retryAfter=${result.retryAfterMs}ms`);
    }

    return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
  }

  /**
   * Legacy sync method — kept for backward compatibility.
   * Prefer checkAndRecord() for new code.
   */
  isRateLimited(_userId: string): boolean {
    // Sync check not possible with Redis; always returns false (non-blocking)
    // Use checkAndRecord() for actual enforcement
    return false;
  }

  /** @deprecated Use checkAndRecord() */
  recordTransaction(_userId: string): void {
    // No-op: Redis sliding window handles this atomically in checkAndRecord()
  }
}
