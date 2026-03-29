import { getRepository } from "typeorm";
import { Transaction } from "../../transactions/entities/transaction.entity";
import { FraudRuleTrigger } from "../../fraud/entities/fraud-rule-trigger.entity";

export class FraudAnalyticsService {
  private txRepo = getRepository(Transaction);
  private ruleRepo = getRepository(FraudRuleTrigger);

  async getRiskDistribution(period: { from: Date; to: Date }) {
    const txs = await this.txRepo.find({
      where: { createdAt: Between(period.from, period.to) },
      select: ["riskScore"],
    });

    const buckets = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
    txs.forEach((t) => {
      const score = t.riskScore;
      if (score <= 20) buckets["0-20"]++;
      else if (score <= 40) buckets["21-40"]++;
      else if (score <= 60) buckets["41-60"]++;
      else if (score <= 80) buckets["61-80"]++;
      else buckets["81-100"]++;
    });

    return buckets;
  }

  async getFlagCounts(period: { from: Date; to: Date }) {
    const flagged = await this.txRepo.count({ where: { status: "flagged", createdAt: Between(period.from, period.to) } });
    const autoResolved = await this.txRepo.count({ where: { status: "auto_resolved", createdAt: Between(period.from, period.to) } });
    const escalated = await this.txRepo.count({ where: { status: "escalated", createdAt: Between(period.from, period.to) } });
    return { flagged, autoResolved, escalated };
  }

  async getRuleEffectiveness(period: { from: Date; to: Date }) {
    const triggers = await this.ruleRepo.find({ where: { createdAt: Between(period.from, period.to) } });
    const grouped: Record<string, { count: number; tp: number; fp: number }> = {};

    triggers.forEach((t) => {
      if (!grouped[t.ruleName]) grouped[t.ruleName] = { count: 0, tp: 0, fp: 0 };
      grouped[t.ruleName].count++;
      if (t.reviewOutcome === "true_positive") grouped[t.ruleName].tp++;
      if (t.reviewOutcome === "false_positive") grouped[t.ruleName].fp++;
    });

    return Object.entries(grouped).map(([rule, stats]) => ({
      rule,
      count: stats.count,
      triggerRate: stats.count / triggers.length,
      tpRate: stats.tp / stats.count,
      fpRate: stats.fp / stats.count,
    }));
  }

  async getHeatmap(period: { from: Date; to: Date }) {
    // 24x7 grid: hours x days
    const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
    const txs = await this.txRepo.find({ where: { createdAt: Between(period.from, period.to), status: "flagged" } });

    txs.forEach((t) => {
      const d = new Date(t.createdAt);
      const day = d.getDay(); // 0–6
      const hour = d.getHours(); // 0–23
      heatmap[day][hour]++;
    });

    return heatmap;
  }
}
