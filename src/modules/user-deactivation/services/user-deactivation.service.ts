import { Injectable, NotFoundException, ConflictException, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDeactivationEntity } from '../entities/user-deactivation.entity';
import { DeactivateUserDto } from '../dto/user-deactivation.dto';
import { USER_ACCESS_CHANGED_EVENT, UserAccessChangedEvent } from '../../../auth/account-status.service';

@Injectable()
export class UserDeactivationService {
  private readonly logger = new Logger(UserDeactivationService.name);

  constructor(
    @InjectRepository(UserDeactivationEntity)
    private readonly deactivationRepo: Repository<UserDeactivationEntity>,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  private announce(userId: string, reason: UserAccessChangedEvent['reason']): void {
    const event: UserAccessChangedEvent = {
      userId,
      reason,
      revokeTokens: reason === 'deactivated',
    };
    this.events?.emit(USER_ACCESS_CHANGED_EVENT, event);
  }

  async deactivate(
    userId: string,
    dto: DeactivateUserDto,
    adminId: string,
  ): Promise<UserDeactivationEntity> {
    const existing = await this.deactivationRepo.findOne({
      where: { userId, isActive: true },
    });

    if (existing) {
      throw new ConflictException(`User ${userId} is already deactivated`);
    }

    const record = this.deactivationRepo.create({
      userId,
      reason: dto.reason,
      deactivatedBy: adminId,
      deactivatedAt: new Date(),
      isActive: true,
    });

    const saved = await this.deactivationRepo.save(record);
    // Revoke refresh tokens and drop cached status so access stops now.
    this.announce(userId, 'deactivated');
    return saved;
  }

  async reactivate(
    userId: string,
    adminId: string,
  ): Promise<UserDeactivationEntity> {
    const record = await this.deactivationRepo.findOne({
      where: { userId, isActive: true },
    });

    if (!record) {
      throw new NotFoundException(`No active deactivation found for user ${userId}`);
    }

    record.isActive = false;
    record.reactivatedBy = adminId;
    record.reactivatedAt = new Date();

    const saved = await this.deactivationRepo.save(record);
    this.announce(userId, 'reactivated');
    return saved;
  }

  async isUserDeactivated(userId: string): Promise<boolean> {
    const record = await this.deactivationRepo.findOne({
      where: { userId, isActive: true },
    });
    return !!record;
  }

  async getHistory(userId: string): Promise<UserDeactivationEntity[]> {
    return this.deactivationRepo.find({
      where: { userId },
      order: { deactivatedAt: 'DESC' },
    });
  }
}
