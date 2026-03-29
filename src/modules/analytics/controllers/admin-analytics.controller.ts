import { Request, Response } from "express";
import { FraudAnalyticsService } from "../services/fraud-analytics.service";

const service = new FraudAnalyticsService();

export async function getFraudAnalytics(req: Request, res: Response) {
  const period = { from: new Date(req.query.from), to: new Date(req.query.to) };
  const distribution = await service.getRiskDistribution(period);
  const counts = await service.getFlagCounts(period);
  const rules = await service.getRuleEffectiveness(period);
  res.json({ distribution, counts, rules });
}

export async function getFraudHeatmap(req: Request, res: Response) {
  const period = { from: new Date(req.query.from), to: new Date(req.query.to) };
  const heatmap = await service.getHeatmap(period);
  res.json({ heatmap });
}
