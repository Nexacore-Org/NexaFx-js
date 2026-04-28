import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';
import { RateProviderService } from '../../../fx/services/rate-provider.service';

export interface WalletBalanceDto {
  walletId: string;
  currency: string;
  available: number;
  pending: number;
  total: number;
}

export interface WalletPortfolioItemDto extends WalletBalanceDto {
  displayCurrencyBalance: number;
  rateUsed: number;
  rateUnavailable?: boolean;
}

export interface PortfolioDto {
  displayCurrency: string;
  wallets: WalletPortfolioItemDto[];
  totalInDisplayCurrency: number;
}

@Injectable()
export class WalletBalanceService {
  private readonly BALANCE_TTL = 5; // seconds
  private readonly logger = new Logger(WalletBalanceService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    private readonly rateProvider: RateProviderService,
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

    const portfolioItems: WalletPortfolioItemDto[] = [];
    let totalInDisplayCurrency = 0;

    for (const balance of walletBalances) {
      if (balance.currency === displayCurrency) {
        portfolioItems.push({
          ...balance,
          displayCurrencyBalance: balance.total,
          rateUsed: 1.0,
        });
        totalInDisplayCurrency += balance.total;
      } else {
        try {
          const rate = await this.rateProvider.getMidRate(balance.currency, displayCurrency);
          const displayCurrencyBalance = balance.total * rate;
          portfolioItems.push({
            ...balance,
            displayCurrencyBalance,
            rateUsed: rate,
          });
          totalInDisplayCurrency += displayCurrencyBalance;
        } catch (err) {
          this.logger.warn(
            `Rate unavailable for ${balance.currency}/${displayCurrency}: ${err?.message}`,
          );
          portfolioItems.push({
            ...balance,
            displayCurrencyBalance: 0,
            rateUsed: 0,
            rateUnavailable: true,
          });
        }
      }
    }

    return {
      displayCurrency,
      wallets: portfolioItems,
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
