import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AmlService, TransactionRecord } from './aml.service';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import {
  TransactionEvent,
  TransactionSidedEvent,
  TransferCompletedEvent,
} from '../common/events/transaction-events';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

/**
 * Bridges completed transaction events into the persisted AML rules. The
 * rules are evaluated asynchronously so monitoring can never fail or slow
 * down the money-movement path.
 */
@Injectable()
export class AmlMonitoringListener {
  private readonly logger = new Logger(AmlMonitoringListener.name);

  constructor(
    private readonly aml: AmlService,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly rates: ExchangeRatesService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent(TransactionEvent.COMPLETED, { async: true })
  handleTransfer(event: TransferCompletedEvent): void {
    void this.evaluate(event.senderId);
  }

  @OnEvent(TransactionEvent.DEPOSIT_COMPLETED, { async: true })
  handleDeposit(event: TransactionSidedEvent): void {
    void this.evaluate(event.userId);
  }

  @OnEvent(TransactionEvent.WITHDRAWAL_COMPLETED, { async: true })
  handleWithdrawal(event: TransactionSidedEvent): void {
    void this.evaluate(event.userId);
  }

  @OnEvent(TransactionEvent.SWAP_COMPLETED, { async: true })
  handleSwap(event: TransactionSidedEvent): void {
    void this.evaluate(event.userId);
  }

  async evaluate(userId: string): Promise<void> {
    if (!userId) return;

    try {
      const recentTxs = await this.loadRecentTransactions(userId);
      const rules: Array<[string, () => Promise<void>]> = [
        ['structuring', () => this.aml.checkStructuring(userId, recentTxs)],
        ['smurfing', () => this.aml.checkSmurfing(userId, recentTxs)],
        ['velocityBurst', () => this.aml.checkVelocityBurst(userId, recentTxs)],
      ];
      for (const [name, run] of rules) {
        try {
          await run();
        } catch (err) {
          this.logger.error(
            `AML rule ${name} failed for user ${userId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `AML monitoring failed for user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  private async loadRecentTransactions(userId: string): Promise<TransactionRecord[]> {
    const windowHours = Math.max(
      this.config.get<number>('aml.structuringWindowHours') ?? 24,
      this.config.get<number>('aml.smurfingWindowHours') ?? 1,
      this.config.get<number>('aml.velocityBurstWindowHours') ?? 1,
    );
    const since = new Date(Date.now() - windowHours * 3600_000);

    const transactions = await this.txRepo.find({
      where: [
        {
          senderId: userId,
          status: TransactionStatus.COMPLETED,
          completedAt: MoreThanOrEqual(since),
        },
        {
          receiverId: userId,
          status: TransactionStatus.COMPLETED,
          completedAt: MoreThanOrEqual(since),
        },
      ],
      order: { completedAt: 'DESC' },
      take: 500,
    });

    return Promise.all(
      transactions.map(async (tx) => ({
        userId,
        amount: await this.toUsd(Number(tx.amount), tx.currency),
        currency: 'USD',
        receiverId: tx.receiverId,
        executedAt: tx.completedAt ?? tx.createdAt,
      })),
    );
  }

  /** The rules compare a single currency; normalise every amount to USD first. */
  private async toUsd(amount: number, currency: string): Promise<number> {
    const code = (currency ?? 'USD').toUpperCase();
    if (code === 'USD') return amount;
    try {
      const { convertedAmount } = await this.rates.calculateConversion(
        code,
        'USD',
        amount,
      );
      return convertedAmount;
    } catch (err) {
      this.logger.warn(
        `No USD rate for ${code}; using the raw amount for AML thresholds: ${(err as Error).message}`,
      );
      return amount;
    }
  }
}
