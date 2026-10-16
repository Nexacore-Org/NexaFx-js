import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycTierUpgradeEntity } from '../entities/kyc-tier-upgrade.entity';
import { KycTier, User } from '../../../users/user.entity';
import { RequestKycTierUpgradeDto } from '../dto/request-kyc-tier-upgrade.dto';
import { ListKycTierUpgradesDto } from '../dto/list-kyc-tier-upgrades.dto';

export const TIER_LEVELS: Record<KycTier, number> = {
  [KycTier.NONE]: 0,
  [KycTier.BASIC]: 1,
  [KycTier.ADVANCED]: 2,
  [KycTier.VERIFIED]: 3,
};

/** A request may move up at most this many levels at once (policy: one step at a time). */
const MAX_TIER_JUMP = 1;

@Injectable()
export class KycTiersService {
  constructor(
    @InjectRepository(KycTierUpgradeEntity)
    private readonly upgradeRepo: Repository<KycTierUpgradeEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async requestUpgrade(userId: string, dto: RequestKycTierUpgradeDto): Promise<KycTierUpgradeEntity> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentTier = user.kycTier ?? KycTier.NONE;
    const requestedLevel = TIER_LEVELS[dto.requestedTier];
    const currentLevel = TIER_LEVELS[currentTier] ?? 0;

    if (requestedLevel === undefined) {
      throw new BadRequestException(`Invalid tier: ${dto.requestedTier}`);
    }
    if (requestedLevel <= currentLevel) {
      throw new BadRequestException('Requested tier must be higher than current tier');
    }
    if (requestedLevel - currentLevel > MAX_TIER_JUMP) {
      throw new BadRequestException('Tiers must be requested one level at a time');
    }

    const pending = await this.upgradeRepo.findOne({
      where: { userId, status: 'pending' },
    });
    if (pending) {
      throw new BadRequestException('You already have a pending tier upgrade request');
    }

    const upgrade = this.upgradeRepo.create({
      userId,
      currentTier,
      requestedTier: dto.requestedTier,
      documents: dto.documents ?? {},
      status: 'pending',
    });

    return this.upgradeRepo.save(upgrade);
  }

  async getStatus(userId: string): Promise<KycTierUpgradeEntity | null> {
    return this.upgradeRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async listUpgrades(dto: ListKycTierUpgradesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.upgradeRepo
      .createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC');

    if (dto.status) {
      qb.andWhere('u.status = :status', { status: dto.status });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * Approve atomically: the pending -> approved flip is one conditional UPDATE
   * and the user's tier is written in the same transaction, so concurrent
   * approvals (409 for the loser) and crashes cannot leave them inconsistent.
   */
  async approve(id: string, adminId: string): Promise<KycTierUpgradeEntity> {
    return this.upgradeRepo.manager.transaction(async (manager) => {
      const upgrade = await manager.findOne(KycTierUpgradeEntity, { where: { id } });
      if (!upgrade) {
        throw new NotFoundException('KYC tier upgrade request not found');
      }

      const claimed = await manager.update(
        KycTierUpgradeEntity,
        { id, status: 'pending' },
        { status: 'approved', reviewedBy: adminId, reviewedAt: new Date() },
      );
      if (!claimed.affected) {
        throw new ConflictException('This request has already been reviewed');
      }

      await manager.update(User, { id: upgrade.userId }, { kycTier: upgrade.requestedTier as KycTier });

      return (await manager.findOne(KycTierUpgradeEntity, { where: { id } })) as KycTierUpgradeEntity;
    });
  }

  async reject(id: string, adminId: string, reason?: string): Promise<KycTierUpgradeEntity> {
    const upgrade = await this.upgradeRepo.findOne({ where: { id } });
    if (!upgrade) {
      throw new NotFoundException('KYC tier upgrade request not found');
    }

    const claimed = await this.upgradeRepo.update(
      { id, status: 'pending' },
      {
        status: 'rejected',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        documents: { ...upgrade.documents, rejectionReason: reason },
      },
    );
    if (!claimed.affected) {
      throw new ConflictException('This request has already been reviewed');
    }

    return (await this.upgradeRepo.findOne({ where: { id } })) as KycTierUpgradeEntity;
  }
}
