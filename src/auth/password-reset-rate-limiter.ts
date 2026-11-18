import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { createHash } from 'crypto';
import Redis from 'ioredis';

export const PASSWORD_RESET_EMAIL_LIMIT = 3;
export const PASSWORD_RESET_EMAIL_WINDOW_MS = 60 * 60 * 1000;

/**
 * Per-target limiter for `POST /auth/forgot-password` (issue #1527). The route is
 * already throttled per client, but an attacker with many IPs could still mail-bomb
 * one victim and repeatedly invalidate their reset link. This counts requests per
 * *email* in Redis (shared across replicas, survives restarts), before any user lookup.
 *
 * Fails open if Redis is unavailable: the per-client throttle still applies and a
 * Redis outage must not turn into "nobody can reset a password".
 */
@Injectable()
export class PasswordResetRateLimiter {
  private readonly logger = new Logger(PasswordResetRateLimiter.name);

  constructor(@Optional() @InjectRedis() private readonly redis?: Redis) {}

  /** Stable, non-reversible id for an email, used for the limiter key and audit entries. */
  static hashEmail(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /** True when this request may proceed; false once the email exceeded its window quota. */
  async allow(email: string): Promise<boolean> {
    if (!this.redis) return true;
    const key = `rl:pwreset:${PasswordResetRateLimiter.hashEmail(email)}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.pexpire(key, PASSWORD_RESET_EMAIL_WINDOW_MS);
      }
      return count <= PASSWORD_RESET_EMAIL_LIMIT;
    } catch (err) {
      this.logger.warn(`Password reset limiter unavailable, allowing request: ${(err as Error).message}`);
      return true;
    }
  }
}
