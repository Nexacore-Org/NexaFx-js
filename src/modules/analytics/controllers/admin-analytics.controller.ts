import { Request, Response } from "express";
import { TransactionAnalyticsService } from "../services/transaction-analytics.service";

const service = new TransactionAnalyticsService();

export async function getAdminTransactionAnalytics(req: Request, res: Response) {
  const period = (req.query.period as "DAILY" | "WEEKLY" | "MONTHLY") || "DAILY";

  const summary = await service.getSummary(null, period);
  const comparison = await service.getPeriodComparison(null, period);
  const categories = await service.getCategoryBreakdown(null, period);
  const series = await service.getTimeSeries(null, period);

  res.json({ summary, comparison, categories, series });
}
