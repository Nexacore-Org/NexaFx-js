import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { AmlRuleEntity } from '../entities/aml-rule.entity';
import { ComplianceCaseService } from './compliance-case.service';

export interface TransactionContext {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  toAddress?: string;
  createdAt: Date;
}

export interface MonitoringResult {
  flagged: boolean;
  triggeredRules: string[];
  riskScoreIncrease: number;
  caseId?: string;
}

@Injectable()
export class AmlMonitoringService {
  private readonly logger = new Logger(AmlMonitoringService.name);

  constructor(
    @InjectRepository(AmlRuleEntity)
    private readonly ruleRepo: Repository<AmlRuleEntity>,
    private readonly complianceCaseService: ComplianceCaseService,
  ) {}

  async evaluate(
    ctx: TransactionContext,
    recentTxns: TransactionContext[],
  ): Promise<MonitoringResult> {
    const rules = await this.ruleRepo.find({ where: { enabled: true } });
    const triggered: string[] = [];
    let riskScore = 0;

    for (const rule of rules) {
      const fired = this.applyRule(rule, ctx, recentTxns);
      if (fired) {
        triggered.push(rule.ruleType);
        riskScore += rule.riskScoreWeight;
        this.logger.warn(`AML rule triggered: ${rule.ruleType} for user ${ctx.userId}`);
      }
    }

    let caseId: string | undefined;
    if (triggered.length > 0) {
      const complianceCase = await this.complianceCaseService.createCase({
        userId: ctx.userId,
        transactionId: ctx.transactionId,
        triggeredRules: triggered,
        riskScore,
      } as any);
      caseId = complianceCase?.id;
    }

    return { flagged: triggered.length > 0, triggeredRules: triggered, riskScoreIncrease: riskScore, caseId };
  }

  private applyRule(
    rule: AmlRuleEntity,
    ctx: TransactionContext,
    recent: TransactionContext[],
  ): boolean {
    const t = rule.thresholds;
    const windowStart = (minutes: number) => {
      const d = new Date(ctx.createdAt);
      d.setMinutes(d.getMinutes() - minutes);
      return d;
    };

    switch (rule.ruleType) {
      case 'STRUCTURING': {
        const last24h = recent.filter((tx) => tx.userId === ctx.userId && tx.createdAt >= windowStart(1440));
        const total = last24h.reduce((s, tx) => s + tx.amount, 0) + ctx.amount;
        return last24h.length >= 2 && total > (t.reportingThreshold ?? 10000);
      }
      case 'VELOCITY_BURST': {
        const lastHour = recent.filter((tx) => tx.userId === ctx.userId && tx.createdAt >= windowStart(60));
        return lastHour.length >= (t.maxTransactionsPerHour ?? 10);
      }
      case 'SMURFING': {
        const lastHour = recent.filter((tx) => tx.createdAt >= windowStart(60));
        const similar = lastHour.filter(
          (tx) => Math.abs(tx.amount - ctx.amount) / ctx.amount <= 0.05,
        );
        const uniqueRecipients = new Set(similar.map((tx) => tx.toAddress)).size;
        return similar.length >= 2 && uniqueRecipients >= 2;
      }
      default:
        return false;
    }
  }
}
