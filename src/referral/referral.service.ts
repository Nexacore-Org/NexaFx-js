import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Referral, ReferralStatus } from './referral.entity';
import { ReferralCode } from './referral-code.entity';
import {
  ReferralReward,
  RewardType,
  RewardStatus,
} from './referral-reward.entity';
import { WalletsService } from '../wallet/wallets.service';
import { UsersService } from '../users/users.service';
import { isSupportedCurrency } from '../currencies/supported-currencies';

export interface ReferralStats {
  totalReferrals: number;
  pending: number;
  qualified: number;
  rewarded: number;
  totalRewardsPaid: number;
}

export interface RewardResult {
  referral: Referral;
  reward: ReferralReward;
  refereeReward?: ReferralReward;
}

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral)
    private readonly referralRepo: Repository<Referral>,
    @InjectRepository(ReferralCode)
    private readonly codeRepo: Repository<ReferralCode>,
    @InjectRepository(ReferralReward)
    private readonly rewardRepo: Repository<ReferralReward>,
    private readonly config: ConfigService,
    private readonly wallets: WalletsService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  /** Idempotent: a user keeps the same code for the life of the program. */
  async generateCode(ownerId: string): Promise<ReferralCode> {
    await this.users.findById(ownerId);

    const existing = await this.codeRepo.findOne({ where: { ownerId } });
    if (existing) return existing;

    const code = `REF-${randomBytes(4).toString('hex').toUpperCase()}`;
    try {
      return await this.codeRepo.save(this.codeRepo.create({ ownerId, code }));
    } catch (err) {
      // A concurrent request may have claimed the owner row first.
      const raced = await this.codeRepo.findOne({ where: { ownerId } });
      if (raced) return raced;
      throw err;
    }
  }

  async applyCode(code: string, refereeId: string): Promise<Referral> {
    const programActive = this.config.get<boolean>('referral.programActive');
    if (!programActive) {
      throw new BadRequestException('Referral program is not active');
    }

    await this.users.findById(refereeId);

    const referralCode = await this.codeRepo.findOne({ where: { code } });
    if (!referralCode) {
      throw new NotFoundException('Referral code not found');
    }
    if (referralCode.ownerId === refereeId) {
      throw new BadRequestException('You cannot apply your own referral code');
    }

    const existing = await this.referralRepo.findOne({
      where: { referredId: refereeId },
    });
    if (existing) {
      throw new BadRequestException('User has already been referred');
    }

    const maxReferrals =
      this.config.get<number>('referral.maxReferrals') ?? 100;
    const referrerCount = await this.referralRepo.count({
      where: { referrerId: referralCode.ownerId },
    });
    if (referrerCount >= maxReferrals) {
      throw new BadRequestException(
        'Referrer has reached the maximum referral limit',
      );
    }

    // Always insert a fresh row; existing referrals (including rewarded ones)
    // are never mutated by a later application of the same code.
    const referral = this.referralRepo.create({
      referrerId: referralCode.ownerId,
      referredId: refereeId,
      referralCode: referralCode.code,
      status: ReferralStatus.PENDING,
    });
    try {
      return await this.referralRepo.save(referral);
    } catch (err) {
      const code = (err as { driverError?: { code?: string }; code?: string })
        .driverError?.code ?? (err as { code?: string }).code;
      if (code === '23505') {
        throw new BadRequestException('User has already been referred');
      }
      throw err;
    }
  }

  async getStats(referrerId: string): Promise<ReferralStats> {
    const all = await this.referralRepo.find({
      where: { referrerId },
    });

    const pending = all.filter((r) => r.status === ReferralStatus.PENDING).length;
    const qualified = all.filter((r) => r.status === ReferralStatus.QUALIFIED).length;
    const rewarded = all.filter((r) => r.status === ReferralStatus.REWARDED).length;

    const rewardedIds = all
      .filter((r) => r.status === ReferralStatus.REWARDED)
      .map((r) => r.id);

    const rewards = rewardedIds.length
      ? await this.rewardRepo.find({
          where: { referralId: In(rewardedIds) },
        })
      : [];

    const totalRewardsPaid = rewards
      .filter((r) => r.status === RewardStatus.PAID)
      .reduce((sum, r) => sum + Number(r.amount), 0);

    return {
      totalReferrals: all.length,
      pending,
      qualified,
      rewarded,
      totalRewardsPaid,
    };
  }

  async findByReferrer(referrerId: string): Promise<Referral[]> {
    return this.referralRepo.find({
      where: { referrerId },
      order: { createdAt: 'DESC' },
    });
  }

  async qualifyReferral(referralId: string): Promise<Referral> {
    const referral = await this.referralRepo.findOne({
      where: { id: referralId },
    });
    if (!referral) {
      throw new NotFoundException(`Referral ${referralId} not found`);
    }
    if (referral.status !== ReferralStatus.PENDING) {
      throw new BadRequestException('Referral is not in pending status');
    }

    referral.status = ReferralStatus.QUALIFIED;
    referral.qualifiedAt = new Date();
    return this.referralRepo.save(referral);
  }

  async rewardReferral(referralId: string): Promise<RewardResult> {
    const referral = await this.referralRepo.findOne({
      where: { id: referralId },
    });
    if (!referral) {
      throw new NotFoundException(`Referral ${referralId} not found`);
    }
    if (referral.status !== ReferralStatus.QUALIFIED) {
      throw new BadRequestException('Referral must be qualified before rewarding');
    }

    const rewardAmount = this.config.get<number>('referral.rewardAmount') ?? 10;
    const refereeRewardAmount =
      this.config.get<number>('referral.refereeRewardAmount') ?? 0;
    const currency = (
      this.config.get<string>('referral.rewardCurrency') ?? 'USD'
    ).toUpperCase();
    if (!isSupportedCurrency(currency)) {
      throw new BadRequestException(
        `Unsupported referral reward currency: ${currency}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Atomic claim: only the request that flips QUALIFIED -> REWARDED may
      // credit a wallet, so concurrent retries cannot double-pay.
      const claim = await manager.update(
        Referral,
        { id: referral.id, status: ReferralStatus.QUALIFIED },
        { status: ReferralStatus.REWARDED, rewardedAt: new Date() },
      );
      if (claim.affected !== 1) {
        throw new BadRequestException('Referral has already been rewarded');
      }

      await this.wallets.adjustBalance(
        referral.referrerId,
        currency,
        rewardAmount,
        manager,
      );

      const reward = manager.create(ReferralReward, {
        referralId: referral.id,
        recipientId: referral.referrerId,
        rewardType: RewardType.CREDIT,
        amount: rewardAmount,
        currency,
        status: RewardStatus.PAID,
        paidAt: new Date(),
      });
      await manager.save(ReferralReward, reward);

      let refereeReward: ReferralReward | undefined;
      if (refereeRewardAmount > 0) {
        await this.wallets.adjustBalance(
          referral.referredId,
          currency,
          refereeRewardAmount,
          manager,
        );
        refereeReward = manager.create(ReferralReward, {
          referralId: referral.id,
          recipientId: referral.referredId,
          rewardType: RewardType.CREDIT,
          amount: refereeRewardAmount,
          currency,
          status: RewardStatus.PAID,
          paidAt: new Date(),
        });
        await manager.save(ReferralReward, refereeReward);
      }

      referral.status = ReferralStatus.REWARDED;
      referral.rewardedAt = new Date();

      return { referral, reward, refereeReward };
    });
  }
}
