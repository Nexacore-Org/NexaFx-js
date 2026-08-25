import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Big from 'big.js';
import { withTransaction } from '../common/helpers/with-transaction.helper';
import {
  normalizeCurrencyCode,
  isSupportedCurrency,
} from '../currencies/supported-currencies';
import { WalletBalanceEntity } from './wallet-balance.entity';
import { WalletBalance } from './wallets.types';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType } from '../ledger/ledger-entry.entity';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepository: Repository<WalletBalanceEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
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

    return withTransaction(this.dataSource, async (manager) => {
      let wallet = await manager.findOne(WalletBalanceEntity, {
        where: { accountId, currency: normalizedCurrency },
        lock: { mode: 'pessimistic_write' as const },
      });

      if (!wallet) {
        wallet = manager.create(WalletBalanceEntity, {
          accountId,
          currency: normalizedCurrency,
          balance: 0,
        });
      }

      const newBalance = Number(new Big(wallet.balance).plus(new Big(delta)).toFixed(2));
      if (newBalance < 0) {
        throw new BadRequestException('Insufficient balance');
      }

      wallet.balance = newBalance;
      const saved = await manager.save(wallet);

      await this.ledgerService.recordEntry({
        userId: accountId,
        type: delta > 0 ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
        amount: Math.abs(delta),
        currency: normalizedCurrency,
        balanceAfter: newBalance,
      });

      return {
        id: saved.id,
        accountId: saved.accountId,
        currency: saved.currency,
        balance: saved.balance,
        label: saved.label,
        color: saved.color,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    });
  }

  async getBalance(
    accountId: string,
    currency: string,
  ): Promise<WalletBalance> {
    const normalizedCurrency = this.validateCurrency(currency);

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
      label: wallet.label,
      color: wallet.color,
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
      label: wallet.label,
      color: wallet.color,
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

  private readonly autoSweepConfigs = new Map<string, { threshold: number; coldStorageAddress: string }>();

  setAutoSweepConfig(userId: string, threshold: number, coldStorageAddress: string) {
    const config = { threshold, coldStorageAddress };
    this.autoSweepConfigs.set(userId, config);
    return config;
  }

  getAutoSweepConfig(userId: string) {
    return this.autoSweepConfigs.get(userId) || null;
  }

  async processAutoSweep(userId: string, currency: string) {
    const config = this.getAutoSweepConfig(userId);
    if (!config) return { swept: false, reason: 'No auto-sweep config set' };
    const wallet = await this.getBalance(userId, currency);
    if (wallet.balance > config.threshold) {
      const sweepAmount = wallet.balance - config.threshold;
      await this.adjustBalance(userId, currency, -sweepAmount);
      return {
        swept: true,
        sweepAmount,
        coldStorageAddress: config.coldStorageAddress,
        remainingBalance: config.threshold,
      };
    }
    }
    return { swept: false, reason: 'Balance below threshold' };
  }

  async updateCustomization(accountId: string, currency: string, label?: string, color?: string): Promise<WalletBalance> {
    const normalizedCurrency = this.validateCurrency(currency);
    const wallet = await this.walletRepository.findOne({ where: { accountId, currency: normalizedCurrency } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }
    if (label !== undefined) wallet.label = label;
    if (color !== undefined) wallet.color = color;
    
    const saved = await this.walletRepository.save(wallet);
    return {
      id: saved.id,
      accountId: saved.accountId,
      currency: saved.currency,
      balance: saved.balance,
      label: saved.label,
      color: saved.color,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }
}
