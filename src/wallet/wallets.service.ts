import { Injectable } from '@nestjs/common';
import { ActivityFeedService } from '../activity-feed/activity-feed.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletBalance } from './wallets.types';
import { WalletBalanceEntity } from './wallet-balance.entity';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletBalanceEntity)
    private walletRepo: Repository<WalletBalanceEntity>,
  ) {}

  constructor(private readonly activityFeedService?: ActivityFeedService) {}

  adjustBalance(
  async adjustBalance(
    accountId: string,
    currency: string,
    delta: number,
  ): Promise<WalletBalance> {
    const upperCurrency = currency.toUpperCase();

    this.wallets.set(key, next);
    void this.activityFeedService?.recordActivity({
      userId: accountId,
      type: 'wallet.balance_adjusted',
      description: `${delta >= 0 ? 'Credited' : 'Debited'} ${currency.toUpperCase()} balance by ${Math.abs(delta).toFixed(2)}`,
      securityEvent: false,
      metadata: {
        accountId,
        currency,
        delta,
        balance: next.balance,
      },
    });
    return next;
  }
    return await this.walletRepo.manager.transaction(async (manager) => {
      const wallet = await manager.findOne(WalletBalanceEntity, {
        where: { accountId, currency: upperCurrency },
        lock: { mode: 'pessimistic_write' },
      });

      let newBalance: number;
      if (wallet) {
        const currentBalance = parseFloat(wallet.balance);
        newBalance = Number((currentBalance + delta).toFixed(8));
        await manager.update(WalletBalanceEntity, { accountId, currency: upperCurrency }, {
          balance: newBalance.toFixed(8),
        });
      } else {
        newBalance = delta;
        await manager.insert(WalletBalanceEntity, {
          accountId,
          currency: upperCurrency,
          balance: newBalance.toFixed(8),
        });
      }

      return {
        accountId,
        currency: upperCurrency,
        balance: newBalance,
      };
    });
  }

  async getBalance(accountId: string, currency: string): Promise<WalletBalance> {
    const upperCurrency = currency.toUpperCase();
    const wallet = await this.walletRepo.findOne({
      where: { accountId, currency: upperCurrency },
    });

    if (wallet) {
      return {
        accountId: wallet.accountId,
        currency: wallet.currency,
        balance: parseFloat(wallet.balance),
      };
    }

    return {
      accountId,
      currency: upperCurrency,
      balance: 0,
    };
  }

  async getBalancesForAccount(accountId: string): Promise<WalletBalance[]> {
    const wallets = await this.walletRepo.find({
      where: { accountId },
    });

    return wallets.map((wallet) => ({
      accountId: wallet.accountId,
      currency: wallet.currency,
      balance: parseFloat(wallet.balance),
    }));
  }
}