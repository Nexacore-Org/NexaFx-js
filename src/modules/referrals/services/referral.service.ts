import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { ReferralEntity } from '../entities/referral.entity';
import { ReferralRewardEntity } from '../entities/referral-reward.entity';
import { ReferralFraudService } from './referral-fraud.service';

export interface ReferralStats {
  referredCount: number;
  conversions: number;
  totalRewards: number;
  currency: string;
}

export interface ReferralProgramConfig {
  rewardAmount: number;
  maxReferrals: number;
  programActive: boolean;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(ReferralEntity)
    private readonly referralRepo: Repository<ReferralEntity>,
    @InjectRepository(ReferralRewardEntity)
    private readonly rewardRepo: Repository<ReferralRewardEntity>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly fraudService: ReferralFraudService,
  ) {}

  /**
   * Generate a unique referral code for a user.
   * Returns the existing active code if the user already has one.
   */
  async generateCode(userId: string): Promise<ReferralEntity> {
    const config = this.getProgramConfig();
    if (!config.programActive) {
      throw new BadRequestException('Referral program is currently inactive');
    }

    // Return existing pending code if present
    const existing = await this.referralRepo.findOne({
      where: { referrerId: userId, status: 'pending', referredId: undefined as any },
    });
    if (existing && !existing.referredId) {
      return existing;
    }

    // Check max referrals
    const referralCount = await this.referralRepo.count({ where: { referrerId: userId } });
    if (referralCount >= config.maxReferrals) {
      throw new BadRequestException(
        `Maximum of ${config.maxReferrals} referrals reached`,
      );
    }

    const code = this.generateUniqueCode();
    const referral = this.referralRepo.create({ referrerId: userId, code, status: 'pending' });
    return this.referralRepo.save(referral);
  }

  /**
   * Link a referred user to the referrer who owns `code`.
   * Called during registration when a referralCode is provided.
   * Self-referral returns 400.
   */
  async applyReferralCode(referredUserId: string, code: string): Promise<ReferralEntity> {
    const referral = await this.referralRepo.findOne({ where: { code } });
    if (!referral) {
      throw new NotFoundException(`Referral code '${code}' not found`);
    }

    if (referral.referrerId === referredUserId) {
      throw new BadRequestException('Self-referral is not allowed');
    }

    if (referral.referredId) {
      throw new ConflictException('Referral code has already been used');
    }

    referral.referredId = referredUserId;
    return this.referralRepo.save(referral);
  }

  /**
   * Trigger conversion for a referred user on their first completed transaction.
   * Idempotent — calling multiple times for the same user is safe.
   */
  async convertReferral(referredUserId: string): Promise<void> {
    const referral = await this.referralRepo.findOne({
      where: { referredId: referredUserId, status: 'pending' },
    });

    if (!referral) return; // No pending referral — nothing to do

    const config = this.getProgramConfig();

    // Idempotent: use a DB transaction to avoid duplicate rewards
    await this.dataSource.transaction(async (manager) => {
      const referralManager = manager.getRepository(ReferralEntity);
      const rewardManager = manager.getRepository(ReferralRewardEntity);

      // Double-check inside transaction
      const locked = await referralManager.findOne({
        where: { id: referral.id, status: 'pending' },
      });
      if (!locked) return; // Already converted by concurrent request

      locked.status = 'converted';
      locked.convertedAt = new Date();
      await referralManager.save(locked);

      // Check if reward already exists (extra idempotency guard)
      const existingReward = await rewardManager.findOne({
        where: { referralId: referral.id },
      });
      if (!existingReward) {
        const reward = rewardManager.create({
          referrerId: locked.referrerId,
          referralId: locked.id,
          amount: config.rewardAmount,
          currency: 'USD',
          disbursed: false,
        });
        await rewardManager.save(reward);
      }
    });

    this.logger.log(
      `Referral converted: referrer=${referral.referrerId}, referred=${referredUserId}`,
    );
  }

  /**
   * Get referral statistics for a user.
   */
  async getStats(userId: string): Promise<ReferralStats> {
    const [referredCount, conversions] = await Promise.all([
      this.referralRepo.count({ where: { referrerId: userId } }),
      this.referralRepo.count({ where: { referrerId: userId, status: 'converted' } }),
    ]);

    const rewards = await this.rewardRepo.find({ where: { referrerId: userId } });
    const totalRewards = rewards.reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

    return { referredCount, conversions, totalRewards, currency: 'USD' };
  }

  /**
   * Get program configuration (admin can override via env).
   */
  getProgramConfig(): ReferralProgramConfig {
    return {
      rewardAmount: this.configService.get<number>('referral.rewardAmount') ?? 10,
      maxReferrals: this.configService.get<number>('referral.maxReferrals') ?? 100,
      programActive: this.configService.get<boolean>('referral.programActive') ?? true,
    };
  }

  /**
   * Admin: update program configuration via environment config.
   * In a production system this would persist to a config table.
   */
  async updateProgramConfig(update: Partial<ReferralProgramConfig>): Promise<ReferralProgramConfig> {
    // Runtime override — persists only for the lifetime of the process.
    // For production, store in a DB-backed config entity.
    if (update.rewardAmount !== undefined) {
      process.env.REFERRAL_REWARD_AMOUNT = String(update.rewardAmount);
    }
    if (update.maxReferrals !== undefined) {
      process.env.REFERRAL_MAX_REFERRALS = String(update.maxReferrals);
    }
    if (update.programActive !== undefined) {
      process.env.REFERRAL_PROGRAM_ACTIVE = String(update.programActive);
    }
    return this.getProgramConfig();
  }

  /** Generate a random 8-character alphanumeric code */
  private generateUniqueCode(): string {
    return randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
  }

  /**
   * Disburse reward to referrer's wallet.
   * Called after fraud check passes or admin approves.
   */
  async disburseReward(rewardId: string): Promise<ReferralRewardEntity> {
    const reward = await this.rewardRepo.findOne({ where: { id: rewardId } });
    if (!reward) throw new NotFoundException(`Reward ${rewardId} not found`);
    if (reward.disbursed) return reward; // idempotent

    // TODO: integrate with wallet service to credit amount
    reward.disbursed = true;
    reward.status = 'disbursed';
    reward.disbursedAt = new Date();
    return this.rewardRepo.save(reward);
  }

  /**
   * Admin: approve a flagged referral reward and disburse it.
   */
  async approveReward(referralId: string): Promise<ReferralRewardEntity> {
    const referral = await this.referralRepo.findOne({ where: { id: referralId } });
    if (!referral) throw new NotFoundException(`Referral ${referralId} not found`);

    // Move referral to converted
    referral.status = 'converted';
    referral.convertedAt = referral.convertedAt ?? new Date();
    await this.referralRepo.save(referral);

    const reward = await this.rewardRepo.findOne({ where: { referralId } });
    if (!reward) throw new NotFoundException(`No reward found for referral ${referralId}`);

    return this.disburseReward(reward.id);
  }

  /**
   * GET /referrals/leaderboard — top 10 referrers by conversion count this month.
   */
  async getLeaderboard(): Promise<{ referrerId: string; conversions: number }[]> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const rows = await this.referralRepo
      .createQueryBuilder('r')
      .select('r.referrerId', 'referrerId')
      .addSelect('COUNT(*)', 'conversions')
      .where('r.status = :status', { status: 'converted' })
      .andWhere('r.convertedAt >= :start', { start: startOfMonth })
      .groupBy('r.referrerId')
      .orderBy('conversions', 'DESC')
      .limit(10)
      .getRawMany();

    return rows.map((r) => ({ referrerId: r.referrerId, conversions: parseInt(r.conversions, 10) }));
  }

  /**
   * Convert referral with fraud detection.
   */
  async convertReferralWithFraudCheck(
    referredUserId: string,
    referredIp?: string,
    referredDevice?: string,
  ): Promise<void> {
    const referral = await this.referralRepo.findOne({
      where: { referredId: referredUserId, status: 'pending' },
    });
    if (!referral) return;

    const config = this.getProgramConfig();

    await this.dataSource.transaction(async (manager) => {
      const referralManager = manager.getRepository(ReferralEntity);
      const rewardManager = manager.getRepository(ReferralRewardEntity);

      const locked = await referralManager.findOne({ where: { id: referral.id, status: 'pending' } });
      if (!locked) return;

      // Fraud check
      const { flagged } = await this.fraudService.checkFraud(
        locked.id,
        locked.referrerIp ?? null,
        referredIp ?? null,
        locked.referrerDevice ?? null,
        referredDevice ?? null,
      );

      if (!flagged) {
        locked.status = 'converted';
        locked.convertedAt = new Date();
      }
      // if flagged, status is already set to pending_review by fraudService

      await referralManager.save(locked);

      const existingReward = await rewardManager.findOne({ where: { referralId: referral.id } });
      if (!existingReward) {
        const reward = rewardManager.create({
          referrerId: locked.referrerId,
          referralId: locked.id,
          amount: config.rewardAmount,
          currency: 'USD',
          disbursed: false,
          status: flagged ? 'pending_review' : 'pending',
        });
        const saved = await rewardManager.save(reward);
        if (!flagged) {
          await this.disburseReward(saved.id);
        }
      }
    });
  }
}
