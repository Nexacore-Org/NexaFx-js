import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

export const TOKEN_VERSION_CHANGED_EVENT = 'user.token-version.changed';
const CACHE_TTL_MS = 5_000;

/** Current `User.tokenVersion`, cached briefly and invalidated when it is bumped. */
@Injectable()
export class TokenVersionService {
  private readonly cache = new Map<string, { version: number; expiresAt: number }>();

  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** `null` when the user no longer exists. */
  async currentVersion(userId: string): Promise<number | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.version;

    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'tokenVersion'] });
    if (!user) return null;
    const version = user.tokenVersion ?? 0;
    this.cache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
    return version;
  }

  @OnEvent(TOKEN_VERSION_CHANGED_EVENT)
  invalidate(event: { userId: string }): void {
    this.cache.delete(event.userId);
  }
}
