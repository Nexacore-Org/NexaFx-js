import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { AccountFreezeEntity } from '../entities/account-freeze.entity';

@Injectable()
export class AccountFreezeService {
  constructor(
    @InjectRepository(AccountFreezeEntity)
    private readonly freezeRepo: Repository<AccountFreezeEntity>,
  ) {}

  async freezeAccount(userId: string, reason: string, frozenBy: string, notes?: string): Promise<AccountFreezeEntity> {
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

    return this.freezeRepo.save(freeze);
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

    return this.freezeRepo.save(activeFreeze);
  }

  async isAccountFrozen(userId: string): Promise<boolean> {
    const activeFreeze = await this.freezeRepo.findOne({
      where: { userId, isActive: true },
    });
    return !!activeFreeze;
  }

  async getFreezeHistory(userId: string): Promise<AccountFreezeEntity[]> {
    return this.freezeRepo.find({
      where: { userId },
      order: { frozenAt: 'DESC' },
    });
  }
}
