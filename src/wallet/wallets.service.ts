import { Injectable, Optional } from '@nestjs/common';
import { Injectable, BadRequestException } from '@nestjs/common';
import {  UnprocessableEntityException } from '@nestjs/common';
import { ActivityFeedService } from '../activity-feed/activity-feed.service';
import { WalletBalance } from './wallets.types';

@Injectable()
export class WalletsService {
  private readonly wallets = new Map<string, WalletBalance>();

  constructor(
    @Optional() private readonly activityFeedService?: ActivityFeedService,
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepository: Repository<WalletBalanceEntity>,
  ) {}

  adjustBalance(
    accountId: string,
    currency: string,
    delta: number,
  ): WalletBalance {
    const key = this.buildKey(accountId, currency);
    const current = this.wallets.get(key) ?? {
      accountId,
      currency,
      balance: 0,
    };
    const next = {
      ...current,
      balance: Number((current.balance + delta).toFixed(2)),
    };
  ): Promise<WalletBalance> {
    if (delta === 0) {
      return this.getBalance(accountId, currency);
    }

    const upperCurrency = currency.toUpperCase();

    return await this.walletRepository.manager.transaction(async (manager) => {
      let wallet = await manager.findOne(WalletBalanceEntity, {
        where: { accountId, currency: upperCurrency },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        wallet = manager.create(WalletBalanceEntity, {
          accountId,
          currency: upperCurrency,
          balance: 0,
        });
      }

      const newBalance = Number((wallet.balance + delta).toFixed(2));
      if (newBalance < 0) {
        throw new BadRequestException('Insufficient balance');
      }

      wallet.balance = newBalance;
      const saved = await manager.save(wallet);

      return {
        id: saved.id,
        accountId: saved.accountId,
        currency: saved.currency,
        balance: saved.balance,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    });
  }

  async getBalance(
    accountId: string,
    currency: string,
  ): Promise<WalletBalance> {
    const upperCurrency = currency.toUpperCase();

    const wallet = await this.walletRepository.findOne({
      where: { accountId, currency: upperCurrency },
    });

    if (!wallet) {
      return {
        accountId,
        currency: upperCurrency,
        balance: 0,
      };
    }

    return {
      id: wallet.id,
      accountId: wallet.accountId,
      currency: wallet.currency,
      balance: wallet.balance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
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

  getBalance(accountId: string, currency: string): WalletBalance {
    return (
      this.wallets.get(this.buildKey(accountId, currency)) ?? {
        accountId,
        currency,
        balance: 0,
      }
    );
  }

  getBalancesForAccount(accountId: string): WalletBalance[] {
    return [...this.wallets.values()].filter(
      (wallet) => wallet.accountId === accountId,
    );
  }

  private buildKey(accountId: string, currency: string): string {
    return `${accountId}:${currency.toUpperCase()}`;
  async getBalancesForAccount(accountId: string): Promise<WalletBalance[]> {
    const wallets = await this.walletRepository.find({
      where: { accountId },
    });

    return wallets.map((w) => ({
      id: w.id,
      accountId: w.accountId,
      currency: w.currency,
      balance: w.balance,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
  }
}
