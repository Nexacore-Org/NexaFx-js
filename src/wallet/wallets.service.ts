import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletBalance } from './wallets.types';
import { WalletBalanceEntity } from './wallet-balance.entity';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepository: Repository<WalletBalanceEntity>,
  ) {}

  async adjustBalance(
    accountId: string,
    currency: string,
    delta: number,
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