import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { setActiveLockService } from './lock-registry';

export type LockResult<T> = { ran: true; result: T } | { ran: false };

interface LockHandle {
  release(): Promise<void>;
  renew?(ttlMs: number): Promise<void>;
}

/** Deletes the key only if it still holds our token, so we never release someone else's lock. */
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

const RENEW_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

/**
 * Cross-instance mutual exclusion for scheduled work (issue #1550).
 *
 * Primary: Redis `SET key token NX PX ttl` with a Lua compare-and-delete release.
 * Fallback (Redis missing or erroring at acquire time): a Postgres session
 * advisory lock held on a dedicated connection.
 */
@Injectable()
export class DistributedLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(
    @Optional() @InjectRedis() private readonly redis?: Redis,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  onModuleInit(): void {
    setActiveLockService(this);
  }

  onModuleDestroy(): void {
    setActiveLockService(undefined);
  }

  /**
   * Runs `fn` only if the lock for `key` was acquired; otherwise returns
   * `{ ran: false }` without running it. Errors from `fn` propagate (after the
   * lock is released) and never trigger the Postgres fallback.
   */
  async runExclusive<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T> | T,
    options?: { heartbeatMs?: number },
  ): Promise<LockResult<T>> {
    const handle = await this.acquire(key, ttlMs);
    if (!handle) return { ran: false };

    const heartbeatMs = options?.heartbeatMs;
    const timer =
      heartbeatMs && handle.renew
        ? setInterval(() => {
            void (handle.renew as (ttl: number) => Promise<void>)(ttlMs).catch(
              (err) => {
                this.logger.warn(
                  `Failed to renew lock "${key}": ${(err as Error).message}`,
                );
              },
            );
          }, heartbeatMs)
        : undefined;
    if (
      timer &&
      typeof (timer as unknown as { unref?: () => void }).unref === 'function'
    ) {
      (timer as unknown as { unref: () => void }).unref();
    }

    try {
      return { ran: true, result: await fn() };
    } finally {
      if (timer) clearInterval(timer);
      try {
        await handle.release();
      } catch (err) {
        this.logger.warn(
          `Failed to release lock "${key}": ${(err as Error).message}`,
        );
      }
    }
  }

  private async acquire(
    key: string,
    ttlMs: number,
  ): Promise<LockHandle | null> {
    if (this.redis) {
      try {
        return await this.acquireRedis(key, ttlMs);
      } catch (err) {
        this.logger.warn(
          `Redis lock for "${key}" failed (${(err as Error).message}); falling back to Postgres advisory lock`,
        );
      }
    }
    if (this.dataSource) {
      return this.acquirePostgres(key);
    }
    // No lock backend at all: run rather than silently never running scheduled work.
    this.logger.warn(
      `No lock backend available for "${key}"; running without mutual exclusion`,
    );
    return { release: () => Promise.resolve() };
  }

  private async acquireRedis(
    key: string,
    ttlMs: number,
  ): Promise<LockHandle | null> {
    const redis = this.redis as Redis;
    const redisKey = `lock:cluster:${key}`;
    const token = randomUUID();
    const ok = await redis.set(redisKey, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return {
      release: async () => {
        await redis.eval(RELEASE_SCRIPT, 1, redisKey, token);
      },
      renew: async (ttl: number) => {
        await redis.eval(RENEW_SCRIPT, 1, redisKey, token, ttl);
      },
    };
  }

  private async acquirePostgres(key: string): Promise<LockHandle | null> {
    const runner = (this.dataSource as DataSource).createQueryRunner();
    await runner.connect();
    try {
      const rows = (await runner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [`cluster-cron:${key}`],
      )) as Array<{ locked: boolean }>;
      if (!rows[0]?.locked) {
        await runner.release();
        return null;
      }
    } catch (err) {
      await runner.release();
      throw err;
    }
    return {
      release: async () => {
        try {
          await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [
            `cluster-cron:${key}`,
          ]);
        } finally {
          await runner.release();
        }
      },
    };
  }
}
