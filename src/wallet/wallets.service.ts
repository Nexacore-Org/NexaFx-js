import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import Big from 'big.js';
import { StrKey } from 'stellar-sdk';
import { randomUUID } from 'crypto';
import { withTransaction } from '../common/helpers/with-transaction.helper';
import {
  normalizeCurrencyCode,
  isSupportedCurrency,
} from '../currencies/supported-currencies';
import { WalletBalanceEntity } from './wallet-balance.entity';
import { WalletBalance } from './wallets.types';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType } from '../ledger/ledger-entry.entity';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';

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
    manager?: EntityManager,
    transactionId?: string,
  ): Promise<WalletBalance> {
    const normalizedCurrency = this.validateCurrency(currency);

    if (delta === 0) {
      return this.getBalance(accountId, normalizedCurrency);
    }

    // #1060: run inside the caller's transaction when one is supplied,
    // instead of always opening an independent one that commits early.
    const run = async (manager: EntityManager) => {
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

      // #1059/#1431: preserve full precision; Big math end-to-end, stored as decimal string
      const newBalance = new Big(String(wallet.balance)).plus(delta);
      if (newBalance.lt(0)) {
        throw new BadRequestException('Insufficient balance');
      }

      wallet.balance = newBalance.toFixed(8);
      const saved = await manager.save(wallet);

      // #1427: write the ledger entry through the same EntityManager so it
      // commits/rolls back atomically with the wallet change, and link it to
      // the originating transaction when one is supplied.
      await this.ledgerService.recordEntry(
        {
          userId: accountId,
          transactionId,
          type: delta > 0 ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
          amount: Math.abs(delta),
          currency: normalizedCurrency,
          balanceAfter: Number(newBalance.toFixed(8)),
        },
        manager,
      );


      return {
        id: saved.id,
        accountId: saved.accountId,
        currency: saved.currency,
        balance: Number(saved.balance),
        label: saved.label,
        color: saved.color,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    };

    return manager ? run(manager) : withTransaction(this.dataSource, run);
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
      balance: Number(wallet.balance),
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
      balance: Number(wallet.balance),
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
    // #1426: only a real Ed25519 public key ("G...") is a valid cold-storage destination.
    if (!StrKey.isValidEd25519PublicKey(coldStorageAddress)) {
      throw new BadRequestException('coldStorageAddress is not a valid Stellar Ed25519 public key');
    }
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
    // #1426: Big math — Postgres decimal columns can come back as strings and
    // native float subtraction loses precision at 8dp.
    const balance = new Big(String(wallet.balance));
    if (balance.gt(String(config.threshold))) {
      const sweepAmount = balance.minus(new Big(String(config.threshold))).toFixed(8);
      await this.adjustBalance(userId, currency, -Number(sweepAmount));
      // Record the sweep as a real transaction so history/reconciliation can see it.
      // On-chain Stellar submission to coldStorageAddress is follow-up.
      const txRepo = this.dataSource.getRepository(Transaction);
      const tx = txRepo.create({
        senderId: userId,
        receiverId: userId,
        amount: Number(sweepAmount),
        currency,
        reference: `sweep_${randomUUID()}`,
        status: TransactionStatus.COMPLETED,
        completedAt: new Date(),
        metadata: {
          type: 'auto_sweep',
          description: 'Auto-sweep to cold storage',
          coldStorageAddress: config.coldStorageAddress,
        },
      });
      const savedTx = await txRepo.save(tx);
      return {
        swept: true,
        sweepAmount,
        coldStorageAddress: config.coldStorageAddress,
        remainingBalance: config.threshold,
        transactionId: savedTx.id,
      };
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
      balance: Number(saved.balance),
      label: saved.label,
      color: saved.color,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }
}
