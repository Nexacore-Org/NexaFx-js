import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Referral } from './referral.entity';
import { WalletsService } from '../wallet/wallets.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral)
    private readonly referralRepo: Repository<Referral>,
    private readonly config: ConfigService,
    private readonly wallets: WalletsService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async generateCode(userId: string): Promise<string> {
    await this.users.findById(userId);
    const code = `REF-${userId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    return code;
  }

  async applyCode(code: string, refereeId: string): Promise<Referral> {
    const programActive = this.config.get<boolean>('referral.programActive');
    if (!programActive) {
      throw new BadRequestException('Referral program is not active');
    }

    await this.users.findById(refereeId);

    const existing = await this.referralRepo.findOne({
      where: { refereeId },
    });
    if (existing) {
      throw new BadRequestException('Referee has already used a referral code');
    }

    const referrals = await this.referralRepo.find({
      where: { code },
    });
    if (!referrals.length) {
      throw new NotFoundException('Referral code not found');
    }

    const referrerId = referrals[0]!.referrerId;

    const maxReferrals =
      this.config.get<number>('referral.maxReferrals') ?? 100;
    const referrerCount = await this.referralRepo.count({
      where: { referrerId },
    });
    if (referrerCount >= maxReferrals) {
      throw new BadRequestException(
        'Referrer has reached the maximum referral limit',
      );
    }

    const referral = this.referralRepo.create({ referrerId, refereeId, code });
    return this.referralRepo.save(referral);
  }

  async creditRewardOnFirstTransaction(refereeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const referral = await manager.findOne(Referral, {
        where: { refereeId, rewardPaid: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!referral) return;

      const rewardAmount =
        this.config.get<number>('referral.rewardAmount') ?? 10;

      await this.wallets.adjustBalance(
        referral.referrerId,
        'USD',
        rewardAmount,
      );

      referral.rewardPaid = true;
      await manager.save(Referral, referral);
    });
  }
}
