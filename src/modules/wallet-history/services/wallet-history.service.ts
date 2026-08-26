import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { WalletBalanceSnapshotEntity } from '../entities/wallet-balance-snapshot.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { QueryWalletHistoryDto } from '../dto/query-wallet-history.dto';

@Injectable()
export class WalletHistoryService {
  constructor(
    @InjectRepository(WalletBalanceSnapshotEntity)
    private readonly snapshotRepo: Repository<WalletBalanceSnapshotEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async recordSnapshot(userId: string): Promise<WalletBalanceSnapshotEntity> {
    const wallets = await this.walletRepo.find({
      where: { userId, status: 'active' },
    });

    const balances: Record<string, number> = {};
    let totalValueUsd = 0;

    if (wallets.length > 0) {
      // Single grouped aggregate instead of one find() per wallet + JS summation (was O(n) per snapshot).
      const sums = await this.txRepo
        .createQueryBuilder('tx')
        .select('tx.walletId', 'walletId')
        .addSelect(
          `SUM(CASE WHEN tx.metadata->>'type' = 'CREDIT' OR tx.fromAddress IS NULL THEN tx.amount ELSE -tx.amount END)`,
          'balance',
        )
        .where('tx.walletId IN (:...walletIds)', { walletIds: wallets.map((w) => w.id) })
        .andWhere('tx.status = :status', { status: 'SUCCESS' })
        .groupBy('tx.walletId')
        .getRawMany<{ walletId: string; balance: string }>();

      const balanceByWallet = new Map(sums.map((s) => [s.walletId, Number(s.balance) || 0]));

      for (const wallet of wallets) {
        const balance = balanceByWallet.get(wallet.id) ?? 0;
        balances[wallet.currency] = (balances[wallet.currency] ?? 0) + balance;
        if (wallet.currency === 'USD') {
          totalValueUsd += balance;
        }
      }
    }

    const snapshot = this.snapshotRepo.create({
      userId,
      balances,
      totalValueUsd,
      snapshotDate: new Date(),
    });

    return this.snapshotRepo.save(snapshot);
  }

  async getHistory(userId: string, dto: QueryWalletHistoryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.userId = :userId', { userId })
      .orderBy('s.snapshotDate', 'DESC');

    if (dto.startDate && dto.endDate) {
      qb.andWhere('s.snapshotDate BETWEEN :startDate AND :endDate', {
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      });
    } else if (dto.startDate) {
      qb.andWhere('s.snapshotDate >= :startDate', { startDate: new Date(dto.startDate) });
    } else if (dto.endDate) {
      qb.andWhere('s.snapshotDate <= :endDate', { endDate: new Date(dto.endDate) });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (dto.currency) {
      const filtered = data.map((snapshot) => ({
        ...snapshot,
        balances: { [dto.currency!]: snapshot.balances[dto.currency!] ?? 0 },
      }));
      return { data: filtered, total, page, limit };
    }

    return { data, total, page, limit };
  }
}
