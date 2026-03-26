import { Injectable } from '@nestjs/common';
import { WalletBalance } from './wallets.types';

@Injectable()
export class WalletsService {
  private readonly wallets = new Map<string, WalletBalance>();

  adjustBalance(accountId: string, currency: string, delta: number): WalletBalance {
    const key = this.buildKey(accountId, currency);
    const current = this.wallets.get(key) ?? { accountId, currency, balance: 0 };
    const next = {
      ...current,
      balance: Number((current.balance + delta).toFixed(2)),
    };

    this.wallets.set(key, next);
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
    return [...this.wallets.values()].filter((wallet) => wallet.accountId === accountId);
  }

  private buildKey(accountId: string, currency: string): string {
    return `${accountId}:${currency.toUpperCase()}`;
  }
}
