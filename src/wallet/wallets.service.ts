import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
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

  async adjustBalance(
    accountId: string,
    currency: string,
    delta: number,
  ): Promise<WalletBalance> {
    const upperCurrency = currency.toUpperCase();

    if (next.balance < 0) {
      throw new UnprocessableEntityException('Insufficient funds');
    }

    this.wallets.set(key, next);
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