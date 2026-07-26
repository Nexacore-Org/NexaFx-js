import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Referral, ReferralStatus } from './referral.entity';
import { ReferralReward, RewardType, RewardStatus } from './referral-reward.entity';
import { WalletsService } from '../wallet/wallets.service';
import { UsersService } from '../users/users.service';

export interface ReferralStats {
  totalReferrals: number;
  pending: number;
  qualified: number;
  rewarded: number;
  totalRewardsPaid: number;
}

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral)
    private readonly referralRepo: Repository<Referral>,
    @InjectRepository(ReferralReward)
    private readonly rewardRepo: Repository<ReferralReward>,
    private readonly config: ConfigService,
    private readonly wallets: WalletsService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async generateCode(referrerId: string): Promise<Referral> {
    await this.users.findById(referrerId);
    const code = `REF-${referrerId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const referral = this.referralRepo.create({
      referrerId,
      referredId: referrerId,
      referralCode: code,
      status: ReferralStatus.PENDING,
    });
    return this.referralRepo.save(referral);
  }

  async applyCode(code: string, refereeId: string): Promise<Referral> {
    const programActive = this.config.get<boolean>('referral.programActive');
    if (!programActive) {
      throw new BadRequestException('Referral program is not active');
    }

    await this.users.findById(refereeId);

    const existing = await this.referralRepo.findOne({
      where: { referredId: refereeId },
    });
    if (existing) {
      throw new BadRequestException('User has already been referred');
    }

    const referral = await this.referralRepo.findOne({
      where: { referralCode: code },
    });
    if (!referral) {
      throw new NotFoundException('Referral code not found');
    }

    const maxReferrals =
      this.config.get<number>('referral.maxReferrals') ?? 100;
    const referrerCount = await this.referralRepo.count({
      where: { referrerId: referral.referrerId },
    });
    if (referrerCount >= maxReferrals) {
      throw new BadRequestException(
        'Referrer has reached the maximum referral limit',
      );
    }

    referral.referredId = refereeId;
    referral.status = ReferralStatus.PENDING;
    return this.referralRepo.save(referral);
  }

  async getStats(referrerId: string): Promise<ReferralStats> {
    const all = await this.referralRepo.find({
      where: { referrerId },
    });

    const pending = all.filter((r) => r.status === ReferralStatus.PENDING).length;
    const qualified = all.filter((r) => r.status === ReferralStatus.QUALIFIED).length;
    const rewarded = all.filter((r) => r.status === ReferralStatus.REWARDED).length;

    const rewards = await this.rewardRepo.find({
      where: all.filter((r) => r.status === ReferralStatus.REWARDED).map((r) => ({ referralId: r.id })),
    });

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

  async rewardReferral(referralId: string): Promise<{ referral: Referral; reward: ReferralReward }> {
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

    return this.dataSource.transaction(async (manager) => {
      await this.wallets.adjustBalance(referral.referrerId, 'USD', rewardAmount);

      const reward = manager.create(ReferralReward, {
        referralId: referral.id,
        rewardType: RewardType.CREDIT,
        amount: rewardAmount,
        currency: 'USD',
        status: RewardStatus.PAID,
        paidAt: new Date(),
      });
      await manager.save(ReferralReward, reward);

      referral.status = ReferralStatus.REWARDED;
      referral.rewardedAt = new Date();
      await manager.save(Referral, referral);

      return { referral, reward };
    });
  }
}
