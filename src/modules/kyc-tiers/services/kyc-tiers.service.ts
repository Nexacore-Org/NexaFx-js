import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import { KycService } from '../../../kyc/kyc.service';
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
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly kyc: KycService,
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

    const saved = await this.upgradeRepo.save(upgrade);
    await this.audit.log({
      userId,
      action: 'kyc.tier.requested',
      entityType: 'kyc_tier_upgrade',
      entityId: saved?.id,
      after: { currentTier, requestedTier: dto.requestedTier },
    });
    return saved;
  }

  /** The caller's own requests, newest first, paginated (issue #1522). */
  async listOwnUpgrades(userId: string, page = 1, limit = 20) {
    const [data, total] = await this.upgradeRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
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
   * Approve atomically: the user row is locked, the request is re-validated against the
   * user's *current* state, the pending -> approved flip is one conditional UPDATE and the
   * tier is written in the same transaction, so concurrent approvals (409 for the loser) and
   * crashes cannot leave them inconsistent (issue #1522).
   */
  async approve(id: string, adminId: string): Promise<KycTierUpgradeEntity> {
    const { result, previousTier } = await this.upgradeRepo.manager.transaction(async (manager) => {
      const upgrade = await manager.findOne(KycTierUpgradeEntity, { where: { id } });
      if (!upgrade) {
        throw new NotFoundException('KYC tier upgrade request not found');
      }
      if (upgrade.status !== 'pending') {
        throw new ConflictException('This request has already been reviewed');
      }

      // Lock the user so a concurrent tier change cannot slip between the checks and the write.
      const user = await manager.findOne(User, { where: { id: upgrade.userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // The request was valid when it was filed; the user may have changed since.
      const currentTier = user.kycTier ?? KycTier.NONE;
      if (currentTier !== upgrade.currentTier) {
        throw new ConflictException(
          `User tier is now ${currentTier}, not ${upgrade.currentTier} as when this request was filed; ask them to re-submit`,
        );
      }
      const requestedLevel = TIER_LEVELS[upgrade.requestedTier as KycTier];
      if (requestedLevel === undefined || requestedLevel <= (TIER_LEVELS[currentTier] ?? 0)) {
        throw new ConflictException('This request no longer raises the user\'s tier');
      }
      // Tiers above BASIC require a verified identity document, not just a claim.
      if (requestedLevel > TIER_LEVELS[KycTier.BASIC] && !(await this.kyc.isApproved(upgrade.userId))) {
        throw new ConflictException('The user has no approved identity verification');
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

      return {
        result: (await manager.findOne(KycTierUpgradeEntity, { where: { id } })) as KycTierUpgradeEntity,
        previousTier: currentTier,
      };
    });

    await this.audit.log({
      userId: adminId,
      action: 'kyc.tier.approved',
      entityType: 'kyc_tier_upgrade',
      entityId: id,
      before: { userId: result.userId, tier: previousTier },
      after: { userId: result.userId, tier: result.requestedTier },
    });
    this.events.emit('kyc.tier.changed', {
      userId: result.userId,
      previousTier,
      newTier: result.requestedTier,
      decision: 'approved',
    });
    return result;
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

    await this.audit.log({
      userId: adminId,
      action: 'kyc.tier.rejected',
      entityType: 'kyc_tier_upgrade',
      entityId: id,
      before: { userId: upgrade.userId, tier: upgrade.currentTier },
      after: { userId: upgrade.userId, requestedTier: upgrade.requestedTier },
      reason,
    });
    this.events.emit('kyc.tier.changed', {
      userId: upgrade.userId,
      previousTier: upgrade.currentTier,
      newTier: upgrade.currentTier,
      decision: 'rejected',
    });

    return (await this.upgradeRepo.findOne({ where: { id } })) as KycTierUpgradeEntity;
  }
}
