import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../entities/wallet.entity';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class FinancialSummaryService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,

    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async getSummary(userId: string) {
    const wallets = await this.walletRepo.find({
      where: { userId },
      withDeleted: true,
      select: ['id'],
    });
    const walletIds = wallets.map((w) => w.id);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const accountAgeDays = user
      ? Math.floor(
          (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        )
      : 0;

    if (!walletIds.length) {
      return this.emptyResponse(accountAgeDays);
    }

    const txs = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.walletId IN (:...walletIds)', { walletIds })
      .select([
        'tx.amount',
        'tx.currency',
        'tx.status',
      ])
      .getMany();

    const totalVolume = txs.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const successCount = txs.filter((tx) => tx.status === 'SUCCESS').length;
    const successRate =
      txs.length > 0
        ? Math.round((successCount / txs.length) * 100 * 100) / 100
        : 0;

    // Top currencies by volume
    const currencyVolume: Record<string, number> = {};
    for (const tx of txs) {
      currencyVolume[tx.currency] =
        (currencyVolume[tx.currency] ?? 0) + Number(tx.amount);
    }
    const topCurrencies = Object.entries(currencyVolume)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([currency, volume]) => ({ currency, volume }));

    return {
      totalTransactions: txs.length,
      successfulTransactions: successCount,
      successRate,
      totalVolume,
      topCurrencies,
      accountAgeDays,
    };
  }

  private emptyResponse(accountAgeDays: number) {
    return {
      totalTransactions: 0,
      successfulTransactions: 0,
      successRate: 0,
      totalVolume: 0,
      topCurrencies: [],
      accountAgeDays,
    };
  }
}
