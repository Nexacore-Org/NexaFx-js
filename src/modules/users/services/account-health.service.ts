import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../entities/wallet.entity';
import { DisputeEntity } from '../../disputes/entities/dispute.entity';

interface HealthFactor {
  label: string;
  points: number;
  earned: boolean;
  suggestion?: string;
}

@Injectable()
export class AccountHealthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,

    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,

    @InjectRepository(DisputeEntity)
    private readonly disputeRepo: Repository<DisputeEntity>,
  ) {}

  async getHealthScore(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    const wallets = await this.walletRepo.find({
      where: { userId },
      withDeleted: true,
      select: ['id'],
    });
    const walletIds = wallets.map((w) => w.id);

    const [txs, openDisputes] = await Promise.all([
      walletIds.length
        ? this.txRepo
            .createQueryBuilder('tx')
            .where('tx.walletId IN (:...walletIds)', { walletIds })
            .select(['tx.status'])
            .getMany()
        : Promise.resolve([]),
      this.disputeRepo.count({
        where: { initiatorUserId: userId, status: 'OPEN' },
      }),
    ]);

    const successRate =
      txs.length > 0
        ? txs.filter((t) => t.status === 'SUCCESS').length / txs.length
        : 0;

    const metadata = user?.metadata ?? {};

    const factors: HealthFactor[] = [
      {
        label: '2FA enabled',
        points: 20,
        earned: !!metadata['twoFactorEnabled'],
        suggestion: 'Enable two-factor authentication for a more secure account.',
      },
      {
        label: 'Email verified',
        points: 15,
        earned: !!metadata['emailVerified'],
        suggestion: 'Verify your email address to secure account recovery.',
      },
      {
        label: 'KYC Basic completed',
        points: 20,
        earned:
          metadata['kycLevel'] === 'BASIC' ||
          metadata['kycLevel'] === 'ADVANCED',
        suggestion: 'Complete basic KYC verification to unlock higher limits.',
      },
      {
        label: 'KYC Advanced completed',
        points: 15,
        earned: metadata['kycLevel'] === 'ADVANCED',
        suggestion:
          'Complete advanced KYC verification for full account access.',
      },
      {
        label: 'No open disputes',
        points: 10,
        earned: openDisputes === 0,
        suggestion: 'Resolve open disputes to maintain a healthy account standing.',
      },
      {
        label: 'High transaction success rate (≥ 90%)',
        points: 20,
        earned: successRate >= 0.9,
        suggestion:
          'Improve your transaction success rate to above 90% for full points.',
      },
    ];

    const score = factors
      .filter((f) => f.earned)
      .reduce((sum, f) => sum + f.points, 0);

    const suggestions = factors
      .filter((f) => !f.earned && f.suggestion)
      .map((f) => f.suggestion!);

    return {
      score,
      maxScore: 100,
      breakdown: factors.map(({ label, points, earned }) => ({
        label,
        points,
        earned,
      })),
      suggestions,
    };
  }
}
