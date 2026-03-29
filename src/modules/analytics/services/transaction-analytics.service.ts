import { getRepository } from "typeorm";
import { Transaction } from "../../transactions/entities/transaction.entity";
import { AggregationService } from "../../aggregation/aggregation.service";

export class TransactionAnalyticsService {
  private txRepo = getRepository(Transaction);

  constructor(private readonly aggregation: AggregationService) {}

  async getSummary(userId: string | null, period: "DAILY" | "WEEKLY" | "MONTHLY") {
    // Use pre-aggregated data if available
    const aggregated = await this.aggregation.getMetrics(userId, period);
    if (aggregated) return aggregated;

    // Fallback to raw query for recent data (<1h)
    const txs = await this.txRepo.find({ where: userId ? { userId } : {} });
    const volume = txs.length;
    const successCount = txs.filter((t) => t.status === "success").length;
    const avgValue = txs.reduce((sum, t) => sum + Number(t.amount), 0) / (txs.length || 1);

    return {
      volume,
      successRate: successCount / (txs.length || 1),
      avgValue,
    };
  }

  async getPeriodComparison(userId: string | null, period: "DAILY" | "WEEKLY" | "MONTHLY") {
    const current = await this.getSummary(userId, period);
    const previous = await this.aggregation.getMetrics(userId, period, { offset: 1 });

    return {
      current,
      previous,
      delta: {
        volume: current.volume - (previous?.volume || 0),
        successRate: current.successRate - (previous?.successRate || 0),
        avgValue: current.avgValue - (previous?.avgValue || 0),
      },
    };
  }

  async getCategoryBreakdown(userId: string | null, period: "DAILY" | "WEEKLY" | "MONTHLY") {
    const categories = await this.aggregation.getCategoryMetrics(userId, period);
    const total = categories.reduce((sum, c) => sum + c.value, 0);
    return categories.map((c) => ({
      category: c.category,
      percentage: total ? c.value / total : 0,
    }));
  }

  async getTimeSeries(userId: string | null, period: "DAILY" | "WEEKLY" | "MONTHLY") {
    return await this.aggregation.getTimeSeries(userId, period);
  }
}
