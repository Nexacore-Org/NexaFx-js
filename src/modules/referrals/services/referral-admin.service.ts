import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ReferralEntity } from '../entities/referral.entity';
import { ReferralRewardEntity } from '../entities/referral-reward.entity';

export interface ReferralProgramSettings {
  rewardAmount: number;
  rewardExpiryDays: number;
  maxReferralsPerUser: number;
  programActive: boolean;
}

export interface ReferralAnalytics {
  totalCodes: number;
  totalConversions: number;
  totalRewardsIssued: number;
  conversionRate: number;
  topReferrers: Array<{ userId: string; conversions: number; totalRewards: number }>;
}

@Injectable()
export class ReferralAdminService {
  private readonly logger = new Logger(ReferralAdminService.name);

  private settings: ReferralProgramSettings = {
    rewardAmount: 10,
    rewardExpiryDays: 30,
    maxReferralsPerUser: 50,
    programActive: true,
  };

  constructor(
    @InjectRepository(ReferralEntity)
    private readonly referralRepo: Repository<ReferralEntity>,
    @InjectRepository(ReferralRewardEntity)
    private readonly rewardRepo: Repository<ReferralRewardEntity>,
  ) {}

  getSettings(): ReferralProgramSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<ReferralProgramSettings>): ReferralProgramSettings {
    this.settings = { ...this.settings, ...patch };
    this.logger.log(`Referral program settings updated: ${JSON.stringify(patch)}`);
    return this.getSettings();
  }

  async expireOldRewards(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.settings.rewardExpiryDays);

    const expired = await this.rewardRepo.find({
      where: { status: 'pending', createdAt: LessThan(cutoff) },
    });

    if (expired.length === 0) return 0;

    await this.rewardRepo.save(
      expired.map((r) => ({ ...r, status: 'pending_review' as const })),
    );

    this.logger.log(`Marked ${expired.length} rewards as expired`);
    return expired.length;
  }

  async getAnalytics(): Promise<ReferralAnalytics> {
    const [referrals, rewards] = await Promise.all([
      this.referralRepo.find(),
      this.rewardRepo.find(),
    ]);

    const conversions = referrals.filter((r) => (r as any).convertedAt).length;
    const totalCodes = referrals.length;
    const totalRewardsIssued = rewards.reduce((sum, r) => sum + Number(r.amount), 0);

    const rewardsByReferrer = rewards.reduce<Record<string, { conversions: number; totalRewards: number }>>(
      (acc, r) => {
        if (!acc[r.referrerId]) acc[r.referrerId] = { conversions: 0, totalRewards: 0 };
        acc[r.referrerId].conversions += 1;
        acc[r.referrerId].totalRewards += Number(r.amount);
        return acc;
      },
      {},
    );

    const topReferrers = Object.entries(rewardsByReferrer)
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 10);

    return {
      totalCodes,
      totalConversions: conversions,
      totalRewardsIssued,
      conversionRate: totalCodes > 0 ? (conversions / totalCodes) * 100 : 0,
      topReferrers,
    };
  }

  async getUserStats(userId: string) {
    const referrals = await this.referralRepo.find({ where: { referrerId: userId } as any });
    if (!referrals.length) throw new NotFoundException(`No referral data for user ${userId}`);

    const rewards = await this.rewardRepo.find({ where: { referrerId: userId } });
    const earnings = rewards.reduce((sum, r) => sum + Number(r.amount), 0);

    return {
      userId,
      codesGenerated: referrals.length,
      conversions: referrals.filter((r) => (r as any).convertedAt).length,
      totalEarnings: earnings,
      pendingRewards: rewards.filter((r) => r.status === 'pending').length,
    };
  }
}
