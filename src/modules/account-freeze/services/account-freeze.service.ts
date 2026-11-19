import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountFreezeEntity } from '../entities/account-freeze.entity';
import { User, UserRole } from '../../../users/user.entity';
import { USER_ACCESS_CHANGED_EVENT, UserAccessChangedEvent } from '../../../auth/account-status.service';
import { AuditService } from '../../../audit/audit.service';

export const ACCOUNT_FROZEN_EVENT = 'account.frozen';
export const ACCOUNT_UNFROZEN_EVENT = 'account.unfrozen';

/** Postgres unique_violation (also what the partial unique index raises). */
const UNIQUE_VIOLATION = '23505';

/** `isAccountFrozen` runs on every money path; keep the answer for a few seconds. */
const FROZEN_CACHE_TTL_MS = 5_000;

@Injectable()
export class AccountFreezeService {
  /** userId -> cached answer. Invalidated immediately by freeze/unfreeze on this instance. */
  private readonly frozenCache = new Map<string, { frozen: boolean; expiresAt: number }>();

  constructor(
    @InjectRepository(AccountFreezeEntity)
    private readonly freezeRepo: Repository<AccountFreezeEntity>,
    @Optional()
    @InjectRepository(User)
    private readonly usersRepo?: Repository<User>,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async freezeAccount(
    userId: string,
    reason: string,
    frozenBy: string,
    notes?: string,
    options: { confirmAdminFreeze?: boolean } = {},
  ): Promise<AccountFreezeEntity> {
    if (!frozenBy) {
      throw new UnauthorizedException('An authenticated admin is required to freeze an account');
    }
    if (userId === frozenBy) {
      throw new ForbiddenException('Admins cannot freeze their own account');
    }

    if (this.usersRepo) {
      const exists = await this.usersRepo.exist({ where: { id: userId } });
      if (!exists) {
        throw new NotFoundException(`User ${userId} not found`);
      }
      // Freezing another admin needs an explicit confirmation from the caller.
      const targetIsAdmin = await this.usersRepo.exist({ where: { id: userId, role: UserRole.ADMIN } });
      if (targetIsAdmin && !options.confirmAdminFreeze) {
        throw new ConflictException(
          'The target is an admin account. Resend with confirmAdminFreeze=true to freeze it.',
        );
      }
    }

    const activeFreeze = await this.freezeRepo.findOne({
      where: { userId, isActive: true },
    });

    if (activeFreeze) {
      throw new ConflictException('Account is already frozen');
    }

    const freeze = this.freezeRepo.create({
      userId,
      reason,
      frozenBy,
      notes,
      frozenAt: new Date(),
      isActive: true,
    });

    let saved: AccountFreezeEntity;
    try {
      saved = await this.freezeRepo.save(freeze);
    } catch (err) {
      // The partial unique index on (userId) WHERE isActive guarantees one
      // active freeze even when two requests race past the check above.
      if ((err as { code?: string })?.code === UNIQUE_VIOLATION) {
        throw new ConflictException('Account is already frozen');
      }
      throw err;
    }

    await this.auditService?.log({
      userId: frozenBy,
      action: 'account.frozen',
      entityType: 'user',
      entityId: userId,
      after: { reason, notes },
      reason,
    });
    this.frozenCache.delete(userId);
    this.events?.emit(ACCOUNT_FROZEN_EVENT, { userId, reason, frozenBy, freezeId: saved.id });
    // Read endpoints stay available, but refresh tokens are revoked so the session cannot be renewed.
    const accessChanged: UserAccessChangedEvent = { userId, reason: 'suspended', revokeTokens: true };
    this.events?.emit(USER_ACCESS_CHANGED_EVENT, accessChanged);
    return saved;
  }

  async unfreezeAccount(userId: string, unfrozenBy: string, notes?: string): Promise<AccountFreezeEntity> {
    const activeFreeze = await this.freezeRepo.findOne({
      where: { userId, isActive: true },
    });

    if (!activeFreeze) {
      throw new NotFoundException('No active freeze found for this account');
    }

    activeFreeze.isActive = false;
    activeFreeze.unfrozenBy = unfrozenBy;
    activeFreeze.unfrozenAt = new Date();
    if (notes) {
      activeFreeze.notes = notes;
    }

    const saved = await this.freezeRepo.save(activeFreeze);

    await this.auditService?.log({
      userId: unfrozenBy,
      action: 'account.unfrozen',
      entityType: 'user',
      entityId: userId,
      after: { notes },
    });
    this.frozenCache.delete(userId);
    this.events?.emit(ACCOUNT_UNFROZEN_EVENT, { userId, unfrozenBy, freezeId: saved.id });
    const accessChanged: UserAccessChangedEvent = { userId, reason: 'reactivated', revokeTokens: false };
    this.events?.emit(USER_ACCESS_CHANGED_EVENT, accessChanged);
    return saved;
  }

  async isAccountFrozen(userId: string): Promise<boolean> {
    const cached = this.frozenCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.frozen;
    }
    const activeFreeze = await this.freezeRepo.findOne({
      where: { userId, isActive: true },
    });
    const frozen = !!activeFreeze;
    this.frozenCache.set(userId, { frozen, expiresAt: Date.now() + FROZEN_CACHE_TTL_MS });
    return frozen;
  }

  /**
   * Throw 403 when the user's account is frozen. Call this at the start of
   * every user-initiated money movement.
   */
  async assertNotFrozen(userId: string): Promise<void> {
    if (await this.isAccountFrozen(userId)) {
      throw new ForbiddenException('Account is frozen and cannot initiate transactions');
    }
  }

  async getFreezeHistory(userId: string, page = 1, limit = 20) {
    const [data, total] = await this.freezeRepo.findAndCount({
      where: { userId },
      order: { frozenAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}
