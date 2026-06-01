import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { withTransaction } from '../common/helpers/with-transaction.helper';
import { WalletBalanceEntity } from './wallet-balance.entity';
import { WalletBalance } from './wallets.types';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepository: Repository<WalletBalanceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async adjustBalance(
    accountId: string,
    currency: string,
    delta: number,
  ): Promise<WalletBalance> {
    const normalizedCurrency = this.validateCurrency(currency);

    if (delta === 0) {
      return this.getBalance(accountId, normalizedCurrency);
    }

    const upperCurrency = currency.toUpperCase();

    return withTransaction(this.dataSource, async (manager) => {
      let wallet = await manager.findOne(WalletBalanceEntity, {
        where: { accountId, currency: normalizedCurrency },
        ...(driverType === 'postgres'
          ? { lock: { mode: 'pessimistic_write' as const } }
          : {}),
      });

      if (!wallet) {
        wallet = manager.create(WalletBalanceEntity, {
          accountId,
          currency: normalizedCurrency,
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

  async getBalance(accountId: string, currency: string): Promise<WalletBalance> {
    const upperCurrency = currency.toUpperCase();

    const wallet = await this.walletRepository.findOne({
      where: { accountId, currency: normalizedCurrency },
    });

    if (!wallet) {
      return {
        accountId,
        currency: normalizedCurrency,
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
    };
  }

  async getBalancesForAccount(accountId: string): Promise<WalletBalance[]> {
    const wallets = await this.walletRepository.find({
      where: { accountId },
    });

    return wallets.map((wallet) => ({
      id: wallet.id,
      accountId: wallet.accountId,
      currency: wallet.currency,
      balance: wallet.balance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    }));
  }

  private validateCurrency(currency: string): string {
    const normalizedCurrency = normalizeCurrencyCode(currency);

    if (!isSupportedCurrency(normalizedCurrency)) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }

    return normalizedCurrency;
  }
}
