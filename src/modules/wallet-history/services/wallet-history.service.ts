import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletBalanceSnapshotEntity } from '../entities/wallet-balance-snapshot.entity';
import { WalletBalanceEntity } from '../../../wallet/wallet-balance.entity';
import { ExchangeRateService } from '../../../fx/exchange-rate.service';
import { QueryWalletHistoryDto } from '../dto/query-wallet-history.dto';

@Injectable()
export class WalletHistoryService {
  constructor(
    @InjectRepository(WalletBalanceSnapshotEntity)
    private readonly snapshotRepo: Repository<WalletBalanceSnapshotEntity>,
    @InjectRepository(WalletBalanceEntity)
    private readonly walletBalanceRepo: Repository<WalletBalanceEntity>,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async recordSnapshot(userId: string): Promise<WalletBalanceSnapshotEntity> {
    const walletBalances = await this.walletBalanceRepo.find({
      where: { accountId: userId },
    });

    const balances: Record<string, number> = {};
    let totalValueUsd = 0;

    for (const walletBalance of walletBalances) {
      const amount = Number(walletBalance.balance) || 0;
      const currency = walletBalance.currency;
      balances[currency] = (balances[currency] ?? 0) + amount;

      if (currency === 'USD') {
        totalValueUsd += amount;
      } else {
        const { rate } = await this.exchangeRateService.getRate(
          currency,
          'USD',
        );
        totalValueUsd += amount * rate;
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
