import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export interface UpcomingTransaction {
  estimatedDate: Date;
  description: string;
  amount: number;
  currency: string;
  type: 'recurring' | 'scheduled';
  confidence: 'high' | 'medium' | 'low';
}

@Injectable()
export class CashflowService {
  private readonly logger = new Logger(CashflowService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
  ) {}

  /**
   * Returns upcoming transactions for a wallet over the next 30 days,
   * derived from recurring patterns in historical transaction data.
   */
  async getUpcomingTransactions(walletId: string): Promise<UpcomingTransaction[]> {
    const now = new Date();
    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - 90);

    const historical = await this.transactionRepo.find({
      where: {
        walletId,
        status: 'SUCCESS',
        createdAt: Between(lookbackStart, now) as any,
      },
      order: { createdAt: 'DESC' },
    });

    return this.detectRecurringPatterns(historical, now);
  }

  /**
   * Computes average daily spending and inflow for a wallet
   * over the last 90 days.
   */
  async getAverageSpendingTrend(walletId: string): Promise<{
    avgDailyOutflow: number;
    avgDailyInflow: number;
    currency: string;
    sampleDays: number;
  }> {
    const now = new Date();
    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - 90);

    const transactions = await this.transactionRepo.find({
      where: {
        walletId,
        status: 'SUCCESS',
        createdAt: Between(lookbackStart, now) as any,
      },
    });

    if (!transactions.length) {
      return { avgDailyOutflow: 0, avgDailyInflow: 0, currency: 'USD', sampleDays: 90 };
    }

    const currency = transactions[0].currency ?? 'USD';

    // Determine inflow/outflow by address direction
    // Transactions where fromAddress is the wallet = outflow
    // Transactions where toAddress is the wallet = inflow
    // Simple heuristic: positive amounts are considered inflow, negative outflow
    let totalOutflow = 0;
    let totalInflow = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      if (tx.fromAddress && tx.fromAddress === walletId) {
        totalOutflow += amount;
      } else {
        totalInflow += amount;
      }
    }

    const sampleDays = 90;
    return {
      avgDailyOutflow: totalOutflow / sampleDays,
      avgDailyInflow: totalInflow / sampleDays,
      currency,
      sampleDays,
    };
  }

  private detectRecurringPatterns(
    transactions: TransactionEntity[],
    from: Date,
  ): UpcomingTransaction[] {
    const upcoming: UpcomingTransaction[] = [];
    const horizon = new Date(from);
    horizon.setDate(horizon.getDate() + 30);

    // Group by description to find recurring transactions
    const byDescription = new Map<string, TransactionEntity[]>();
    for (const tx of transactions) {
      const key = tx.description ?? tx.metadata?.merchant ?? 'unknown';
      if (!byDescription.has(key)) byDescription.set(key, []);
      byDescription.get(key)!.push(tx);
    }

    for (const [description, txs] of byDescription) {
      if (txs.length < 2) continue;

      const sorted = txs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Compute intervals between occurrences
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const diffDays =
          (sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime()) /
          (1000 * 60 * 60 * 24);
        intervals.push(diffDays);
      }

      const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;

      // Only consider patterns that look monthly (25–35 days) or weekly (5–9 days)
      const isMonthly = avgInterval >= 25 && avgInterval <= 35;
      const isWeekly = avgInterval >= 5 && avgInterval <= 9;
      if (!isMonthly && !isWeekly) continue;

      const lastTx = sorted[sorted.length - 1];
      const nextDate = new Date(lastTx.createdAt);
      nextDate.setDate(nextDate.getDate() + Math.round(avgInterval));

      if (nextDate >= from && nextDate <= horizon) {
        const avgAmount =
          txs.reduce((sum, t) => sum + Number(t.amount), 0) / txs.length;

        upcoming.push({
          estimatedDate: nextDate,
          description,
          amount: Math.round(avgAmount * 100) / 100,
          currency: lastTx.currency ?? 'USD',
          type: 'recurring',
          confidence: txs.length >= 3 ? 'high' : 'medium',
        });
      }
    }

    return upcoming.sort((a, b) => a.estimatedDate.getTime() - b.estimatedDate.getTime());
  }
}
