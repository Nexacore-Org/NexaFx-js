import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
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
  private readonly cache = new Map<string, { allowed: boolean; passwordChangedAtSec: number | null; expiresAt: number }>();

  constructor(
    private readonly usersService: UsersService,
    @Optional() private readonly deactivationService?: UserDeactivationService,
    @Optional() private readonly refreshTokens?: RefreshTokensService,
  ) {}

  async isAllowedToAuthenticate(userId: string): Promise<boolean> {
    return (await this.snapshot(userId)).allowed;
  }

  /** One cached lookup answers both "may they authenticate?" and "when did the password change?". */
  private async snapshot(userId: string): Promise<{ allowed: boolean; passwordChangedAtSec: number | null }> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const user = await this.usersService.findByIdOrNull(userId);
    let allowed = !!user && user.isActive !== false;
    if (allowed && this.deactivationService) {
      allowed = !(await this.deactivationService.isUserDeactivated(userId));
    }

    const entry = {
      allowed,
      passwordChangedAtSec: user?.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(userId, entry);
    return entry;
  }

  /**
   * The checks that must apply to every access token on every route (issue #1536): the account may
   * authenticate (not suspended, deactivated or deleted), and the token was not issued before the
   * last password change. Called by both the global guard and `JwtStrategy`, so a pre-reset token
   * is refused everywhere, not only on passport-guarded routes.
   */
  async assertTokenAccepted(payload: { sub?: string; iat?: number }): Promise<void> {
    if (!payload.sub) throw new UnauthorizedException('Invalid authentication token');
    const { allowed, passwordChangedAtSec } = await this.snapshot(payload.sub);
    if (!allowed) throw new UnauthorizedException('Account is not active');
    if (passwordChangedAtSec !== null && payload.iat !== undefined && payload.iat < passwordChangedAtSec) {
      throw new UnauthorizedException('Token invalidated by password change');
    }
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
