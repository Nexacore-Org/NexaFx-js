import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountFreezeEntity } from '../entities/account-freeze.entity';
import { User } from '../../../users/user.entity';
import { AuditService } from '../../../audit/audit.service';

export const ACCOUNT_FROZEN_EVENT = 'account.frozen';
export const ACCOUNT_UNFROZEN_EVENT = 'account.unfrozen';

/** Postgres unique_violation (also what the partial unique index raises). */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class AccountFreezeService {
  constructor(
    @InjectRepository(AccountFreezeEntity)
    private readonly freezeRepo: Repository<AccountFreezeEntity>,
    @Optional()
    @InjectRepository(User)
    private readonly usersRepo?: Repository<User>,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async freezeAccount(userId: string, reason: string, frozenBy: string, notes?: string): Promise<AccountFreezeEntity> {
    if (this.usersRepo) {
      const exists = await this.usersRepo.exist({ where: { id: userId } });
      if (!exists) {
        throw new NotFoundException(`User ${userId} not found`);
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
    this.events?.emit(ACCOUNT_FROZEN_EVENT, { userId, reason, frozenBy, freezeId: saved.id });
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
    this.events?.emit(ACCOUNT_UNFROZEN_EVENT, { userId, unfrozenBy, freezeId: saved.id });
    return saved;
  }

  async isAccountFrozen(userId: string): Promise<boolean> {
    const activeFreeze = await this.freezeRepo.findOne({
      where: { userId, isActive: true },
    });
    return !!activeFreeze;
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

  async getFreezeHistory(userId: string): Promise<AccountFreezeEntity[]> {
    return this.freezeRepo.find({
      where: { userId },
      order: { frozenAt: 'DESC' },
    });
  }
}
