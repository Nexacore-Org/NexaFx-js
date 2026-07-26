import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDeactivationEntity } from '../entities/user-deactivation.entity';
import { DeactivateUserDto } from '../dto/user-deactivation.dto';

@Injectable()
export class UserDeactivationService {
  private readonly logger = new Logger(UserDeactivationService.name);

  constructor(
    @InjectRepository(UserDeactivationEntity)
    private readonly deactivationRepo: Repository<UserDeactivationEntity>,
  ) {}

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

    return this.deactivationRepo.save(record);
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

    return this.deactivationRepo.save(record);
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
