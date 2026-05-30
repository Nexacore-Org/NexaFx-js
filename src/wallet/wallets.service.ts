import { Injectable, Optional } from '@nestjs/common';
import { ActivityFeedService } from '../activity-feed/activity-feed.service';
import { WalletBalance } from './wallets.types';

@Injectable()
export class WalletsService {
  private readonly wallets = new Map<string, WalletBalance>();

  constructor(
    @Optional() private readonly activityFeedService?: ActivityFeedService,
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
  }
}
