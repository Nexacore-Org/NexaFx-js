import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycTierUpgradeEntity, KycTierUpgradeStatus } from '../entities/kyc-tier-upgrade.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { RequestKycTierUpgradeDto } from '../dto/request-kyc-tier-upgrade.dto';
import { ListKycTierUpgradesDto } from '../dto/list-kyc-tier-upgrades.dto';

const TIER_LEVELS: Record<string, number> = {
  NONE: 0,
  BASIC: 1,
  ADVANCED: 2,
  VERIFIED: 3,
};

@Injectable()
export class KycTiersService {
  constructor(
    @InjectRepository(KycTierUpgradeEntity)
    private readonly upgradeRepo: Repository<KycTierUpgradeEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async requestUpgrade(userId: string, dto: RequestKycTierUpgradeDto): Promise<KycTierUpgradeEntity> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentTier = (user.metadata?.kycTier as string) ?? 'NONE';
    const requestedLevel = TIER_LEVELS[dto.requestedTier.toUpperCase()];
    const currentLevel = TIER_LEVELS[currentTier.toUpperCase()] ?? 0;

    if (requestedLevel === undefined) {
      throw new BadRequestException(`Invalid tier: ${dto.requestedTier}`);
    }

    if (requestedLevel <= currentLevel) {
      throw new BadRequestException('Requested tier must be higher than current tier');
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
      requestedTier: dto.requestedTier.toUpperCase(),
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

  async approve(id: string, adminId: string): Promise<KycTierUpgradeEntity> {
    const upgrade = await this.upgradeRepo.findOne({ where: { id } });
    if (!upgrade) {
      throw new NotFoundException('KYC tier upgrade request not found');
    }
    if (upgrade.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be approved');
    }

    upgrade.status = 'approved';
    upgrade.reviewedBy = adminId;
    upgrade.reviewedAt = new Date();

    const saved = await this.upgradeRepo.save(upgrade);

    const user = await this.userRepo.findOne({ where: { id: upgrade.userId } });
    if (user) {
      user.metadata = user.metadata ?? {};
      user.metadata.kycTier = upgrade.requestedTier;
      await this.userRepo.save(user);
    }

    return saved;
  }

  async reject(id: string, adminId: string, reason?: string): Promise<KycTierUpgradeEntity> {
    const upgrade = await this.upgradeRepo.findOne({ where: { id } });
    if (!upgrade) {
      throw new NotFoundException('KYC tier upgrade request not found');
    }
    if (upgrade.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    upgrade.status = 'rejected';
    upgrade.reviewedBy = adminId;
    upgrade.reviewedAt = new Date();
    upgrade.documents = { ...upgrade.documents, rejectionReason: reason };

    return this.upgradeRepo.save(upgrade);
  }
}
