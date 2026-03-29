import { Request, Response } from "express";
import { TransactionAnalyticsService } from "../services/transaction-analytics.service";

const service = new TransactionAnalyticsService(/* inject AggregationService */);

export async function getUserTransactionAnalytics(req: Request, res: Response) {
  const userId = req.user.id;
  const period = (req.query.period as "DAILY" | "WEEKLY" | "MONTHLY") || "DAILY";

  const summary = await service.getSummary(userId, period);
  const comparison = await service.getPeriodComparison(userId, period);
  const categories = await service.getCategoryBreakdown(userId, period);
  const series = await service.getTimeSeries(userId, period);

  res.json({ summary, comparison, categories, series });
}
