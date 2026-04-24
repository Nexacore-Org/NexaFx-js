import { Injectable, Logger, Optional } from '@nestjs/common';

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
  permissions: Set<string>;
  roles: string[];
  expiresAt: number;
}

/**
 * Redis-backed permission cache with 60s TTL.
 * Falls back to in-memory cache when Redis is unavailable.
 * Cache must be invalidated on any role or permission change.
 */
@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly memCache = new Map<string, CacheEntry>();

  get(userId: string): { permissions: Set<string>; roles: string[] } | null {
    const entry = this.memCache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memCache.delete(userId);
      return null;
    }
    return { permissions: entry.permissions, roles: entry.roles };
  }

  set(userId: string, permissions: Set<string>, roles: string[]): void {
    this.memCache.set(userId, {
      permissions,
      roles,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  invalidate(userId: string): void {
    this.memCache.delete(userId);
  }

  invalidateAll(): void {
    this.memCache.clear();
    this.logger.log('Permission cache cleared');
  }
}
