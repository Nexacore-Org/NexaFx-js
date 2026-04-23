import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, Between } from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export interface CategoryInsight {
  category: string;
  amount: number;
  percentage: number;
  delta: number;
  unusualSpike: boolean;
}

export interface BudgetSuggestion {
  category: string;
  suggestedMonthlyBudget: number;
  avgMonthlySpend: number;
}

export interface SpendingInsightsResult {
  period: string;
  insights: CategoryInsight[];
  budgetSuggestions: BudgetSuggestion[];
}

@Injectable()
export class SpendingInsightsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async getSpendingInsights(
    userId: string,
    period: 'MONTHLY' | 'WEEKLY' = 'MONTHLY',
  ): Promise<SpendingInsightsResult> {
    const now = new Date();
    const periodDays = period === 'MONTHLY' ? 30 : 7;

    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - periodDays);

    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - periodDays);

    const [currentTxs, prevTxs] = await Promise.all([
      this.txRepo.find({
        where: {
          userId,
          category: Not(IsNull()),
          createdAt: Between(currentStart, now) as any,
        },
      }),
      this.txRepo.find({
        where: {
          userId,
          category: Not(IsNull()),
          createdAt: Between(prevStart, currentStart) as any,
        },
      }),
    ]);

    const currentTotals = this.aggregateByCategory(currentTxs);
    const prevTotals = this.aggregateByCategory(prevTxs);

    const total = Object.values(currentTotals).reduce((s, v) => s + v, 0);

    const top5 = Object.entries(currentTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const insights: CategoryInsight[] = top5.map(([category, amount]) => {
      const prev = prevTotals[category] ?? 0;
      const delta = prev > 0 ? (amount - prev) / prev : 0;
      return {
        category,
        amount: Math.round(amount * 100) / 100,
        percentage: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
        delta: Math.round(delta * 10000) / 100,
        unusualSpike: delta > 0.5,
      };
    });

    const budgetSuggestions = await this.getBudgetSuggestions(userId);

    return { period, insights, budgetSuggestions };
  }

  async getBudgetSuggestions(userId: string): Promise<BudgetSuggestion[]> {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 90);

    const txs = await this.txRepo.find({
      where: {
        userId,
        category: Not(IsNull()),
        createdAt: Between(start, now) as any,
      },
    });

    // Group by category and month
    const monthlyByCategory: Record<string, Record<string, number>> = {};
    for (const tx of txs) {
      const cat = tx.category!;
      const month = tx.createdAt.toISOString().substring(0, 7);
      if (!monthlyByCategory[cat]) monthlyByCategory[cat] = {};
      monthlyByCategory[cat][month] =
        (monthlyByCategory[cat][month] ?? 0) + Number(tx.amount);
    }

    const suggestions: BudgetSuggestion[] = [];
    for (const [category, months] of Object.entries(monthlyByCategory)) {
      const monthCount = Object.keys(months).length;
      if (monthCount >= 3) {
        const avgMonthlySpend =
          Object.values(months).reduce((s, v) => s + v, 0) / monthCount;
        suggestions.push({
          category,
          avgMonthlySpend: Math.round(avgMonthlySpend * 100) / 100,
          suggestedMonthlyBudget: Math.round(avgMonthlySpend * 1.1 * 100) / 100,
        });
      }
    }

    return suggestions;
  }

  private aggregateByCategory(txs: TransactionEntity[]): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const tx of txs) {
      if (!tx.category) continue;
      totals[tx.category] = (totals[tx.category] ?? 0) + Number(tx.amount);
    }
    return totals;
  }
}
