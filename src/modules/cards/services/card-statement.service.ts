import { Injectable, Logger } from '@nestjs/common';

export interface CardTransaction {
  id: string;
  cardId: string;
  amount: number;
  currency: string;
  merchantName: string;
  merchantCategory: string;
  createdAt: Date;
}

export interface SpendingByCategory {
  category: string;
  total: number;
  count: number;
}

export interface CardStatement {
  cardId: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: number;
  closingBalance: number;
  totalSpend: number;
  transactionCount: number;
  categoryBreakdown: SpendingByCategory[];
  transactions: CardTransaction[];
  generatedAt: Date;
}

@Injectable()
export class CardStatementService {
  private readonly logger = new Logger(CardStatementService.name);

  generateStatement(
    cardId: string,
    transactions: CardTransaction[],
    openingBalance: number,
    periodStart: Date,
    periodEnd: Date,
  ): CardStatement {
    const periodTxns = transactions.filter(
      (t) => t.cardId === cardId && t.createdAt >= periodStart && t.createdAt <= periodEnd,
    );

    const totalSpend = periodTxns.reduce((sum, t) => sum + t.amount, 0);
    const closingBalance = openingBalance - totalSpend;
    const categoryBreakdown = this.groupByCategory(periodTxns);

    this.logger.log(`Statement generated for card ${cardId}: ${periodTxns.length} transactions`);

    return {
      cardId,
      periodStart,
      periodEnd,
      openingBalance,
      closingBalance,
      totalSpend,
      transactionCount: periodTxns.length,
      categoryBreakdown,
      transactions: periodTxns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      generatedAt: new Date(),
    };
  }

  getSpendingAnalytics(
    cardId: string,
    transactions: CardTransaction[],
  ): SpendingByCategory[] {
    const cardTxns = transactions.filter((t) => t.cardId === cardId);
    return this.groupByCategory(cardTxns);
  }

  getPaginatedTransactions(
    cardId: string,
    transactions: CardTransaction[],
    page = 1,
    limit = 20,
  ): { data: CardTransaction[]; total: number; page: number } {
    const cardTxns = transactions
      .filter((t) => t.cardId === cardId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (page - 1) * limit;
    return {
      data: cardTxns.slice(start, start + limit),
      total: cardTxns.length,
      page,
    };
  }

  resetMonthlySpend(cardIds: string[]): string[] {
    this.logger.log(`Monthly spend reset triggered for ${cardIds.length} cards`);
    return cardIds;
  }

  private groupByCategory(transactions: CardTransaction[]): SpendingByCategory[] {
    const map = new Map<string, SpendingByCategory>();

    for (const t of transactions) {
      const cat = t.merchantCategory || 'OTHER';
      const entry = map.get(cat) ?? { category: cat, total: 0, count: 0 };
      entry.total += t.amount;
      entry.count += 1;
      map.set(cat, entry);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }
}
