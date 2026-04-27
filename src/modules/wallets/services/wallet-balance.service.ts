import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';

export interface WalletBalanceDto {
  walletId: string;
  currency: string;
  available: number;
  pending: number;
  total: number;
}

export interface PortfolioDto {
  displayCurrency: string;
  wallets: WalletBalanceDto[];
  totalInDisplayCurrency: number;
}

@Injectable()
export class WalletBalanceService {
  private readonly BALANCE_TTL = 5; // seconds

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async getBalance(walletId: string): Promise<WalletBalanceDto> {
    const cacheKey = `wallet:balance:${walletId}`;
    const cached = await this.cache.get<WalletBalanceDto>(cacheKey);
    if (cached) return cached;

    const wallet = await this.walletRepo.findOneOrFail({ where: { id: walletId } });
    const balance = await this.computeBalance(walletId, wallet.type);

    await this.cache.set(cacheKey, balance, this.BALANCE_TTL);
    return balance;
  }

  async invalidateCache(walletId: string): Promise<void> {
    await this.cache.del(`wallet:balance:${walletId}`);
  }

  async getPortfolio(userId: string, displayCurrency = 'USD'): Promise<PortfolioDto> {
    const wallets = await this.walletRepo.find({ where: { userId, status: 'active' } });

    const walletBalances = await Promise.all(
      wallets.map((w) => this.getBalance(w.id)),
    );

    // Simple 1:1 rate fallback — real FX rates would come from FxAggregatorService
    const totalInDisplayCurrency = walletBalances.reduce((sum, b) => sum + b.total, 0);

    return {
      displayCurrency,
      wallets: walletBalances,
      totalInDisplayCurrency,
    };
  }

  private async computeBalance(walletId: string, currency: string): Promise<WalletBalanceDto> {
    // Use DB aggregate queries instead of loading all transactions into memory
    const availableQuery = this.txRepo
      .createQueryBuilder('tx')
      .select([
        'SUM(CASE WHEN tx.direction = :credit THEN tx.amount ELSE -tx.amount END) as total',
      ])
      .where('tx.walletId = :walletId', { walletId })
      .andWhere('tx.status = :status', { status: 'SUCCESS' })
      .setParameter('credit', 'CREDIT')
      .getRawOne();

    const pendingQuery = this.txRepo
      .createQueryBuilder('tx')
      .select([
        'SUM(CASE WHEN tx.direction = :credit THEN tx.amount ELSE -tx.amount END) as total',
      ])
      .where('tx.walletId = :walletId', { walletId })
      .andWhere('tx.status = :status', { status: 'PENDING' })
      .setParameter('credit', 'CREDIT')
      .getRawOne();

    const [availableResult, pendingResult] = await Promise.all([
      availableQuery,
      pendingQuery,
    ]);

    const available = Number(availableResult?.total || 0);
    const pending = Number(pendingResult?.total || 0);

    return {
      walletId,
      currency,
      available,
      pending,
      total: available + pending,
    };
  }
}
