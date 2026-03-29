import { getRepository } from "typeorm";
import { Transaction } from "../../transactions/entities/transaction.entity";

export class SpendingInsightsService {
  private txRepo = getRepository(Transaction);

  async getSpendingInsights(userId: string, period: "MONTHLY" | "WEEKLY") {
    // Fetch categorized transactions
    const txs = await this.txRepo.find({ where: { userId, category: Not(IsNull()) } });

    // Aggregate by category
    const categoryTotals: Record<string, number> = {};
    txs.forEach((t) => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + Number(t.amount);
    });

    // Sort top 5 categories
    const sorted = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const total = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);

    // Compute period-over-period deltas (simplified: compare last vs previous period)
    const insights = sorted.map(([category, amount]) => {
      const prevAmount = this.getPreviousPeriodAmount(userId, category, period);
      const delta = prevAmount ? (amount - prevAmount) / prevAmount : 0;
      const unusualSpike = delta > 0.5;
      return {
        category,
        amount,
        percentage: total ? amount / total : 0,
        delta,
        unusualSpike,
      };
    });

    // Budget suggestions: categories with >3 months consistent spending
    const suggestions = insights
      .filter((i) => this.hasConsistentSpending(userId, i.category, 3))
      .map((i) => ({
        category: i.category,
        suggestion: `Consider setting a monthly budget for ${i.category}`,
      }));

    return { insights, suggestions };
  }

  private async getPreviousPeriodAmount(userId: string, category: string, period: string): Promise<number> {
    // Placeholder: query aggregation table for previous period
    return 0;
  }

  private async hasConsistentSpending(userId: string, category: string, months: number): Promise<boolean> {
    // Placeholder: check if spending exists for N consecutive months
    return true;
  }
}
