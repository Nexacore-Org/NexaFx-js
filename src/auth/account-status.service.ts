import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UsersService } from '../users/users.service';
import { UserDeactivationService } from '../modules/user-deactivation/services/user-deactivation.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';

/** Emitted whenever an account is suspended, deactivated, reactivated or activated. */
export const USER_ACCESS_CHANGED_EVENT = 'user.access.changed';

export interface UserAccessChangedEvent {
  userId: string;
  reason: 'suspended' | 'deactivated' | 'reactivated' | 'activated';
  /** True when the user lost access and their refresh tokens must be revoked. */
  revokeTokens: boolean;
}

const CACHE_TTL_MS = 5_000;

/**
 * Single answer to "may this user authenticate right now?", combining the two
 * disable mechanisms: `User.isActive` (admin suspend) and the active
 * `user_deactivations` record. Results are cached briefly and invalidated as
 * soon as an access change is announced.
 */
@Injectable()
export class AccountStatusService {
  private readonly logger = new Logger(AccountStatusService.name);
  private readonly cache = new Map<string, { allowed: boolean; expiresAt: number }>();

  constructor(
    private readonly usersService: UsersService,
    @Optional() private readonly deactivationService?: UserDeactivationService,
    @Optional() private readonly refreshTokens?: RefreshTokensService,
  ) {}

  async isAllowedToAuthenticate(userId: string): Promise<boolean> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.allowed;

    const user = await this.usersService.findByIdOrNull(userId);
    let allowed = !!user && user.isActive !== false;
    if (allowed && this.deactivationService) {
      allowed = !(await this.deactivationService.isUserDeactivated(userId));
    }

    this.cache.set(userId, { allowed, expiresAt: Date.now() + CACHE_TTL_MS });
    return allowed;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  @OnEvent(USER_ACCESS_CHANGED_EVENT)
  async handleAccessChanged(event: UserAccessChangedEvent): Promise<void> {
    this.invalidate(event.userId);
    if (event.revokeTokens && this.refreshTokens) {
      try {
        await this.refreshTokens.revokeUserTokens(event.userId);
      } catch (err) {
        this.logger.error(
          `Failed to revoke refresh tokens for ${event.userId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
