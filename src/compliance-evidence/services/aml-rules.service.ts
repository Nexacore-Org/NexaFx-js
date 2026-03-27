import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AmlRuleEntity, AmlRuleType } from '../entities/aml-rule.entity';
import { ComplianceCaseService } from './compliance-case.service';

export interface AmlEvaluationContext {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  toAddress?: string;
  fromAddress?: string;
  createdAt: Date;
}

export interface AmlEvaluationResult {
  flagged: boolean;
  triggeredRules: string[];
  riskScoreIncrease: number;
}

@Injectable()
export class AmlRulesService implements OnModuleInit {
  private readonly logger = new Logger(AmlRulesService.name);

  constructor(
    @InjectRepository(AmlRuleEntity)
    private readonly ruleRepo: Repository<AmlRuleEntity>,
    private readonly dataSource: DataSource,
    private readonly complianceCaseService: ComplianceCaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Seed default AML rules on startup if they don't exist yet.
   */
  async onModuleInit() {
    await this.seedDefaultRules();
  }

  /**
   * Evaluate all enabled AML rules against a newly committed transaction.
   * This MUST be called asynchronously (after commit) — never inside a DB transaction.
   */
  async evaluate(ctx: AmlEvaluationContext): Promise<AmlEvaluationResult> {
    const rules = await this.ruleRepo.find({ where: { enabled: true } });

    const triggeredRules: string[] = [];
    let riskScoreIncrease = 0;
    const evidenceIds: string[] = [ctx.transactionId];

    for (const rule of rules) {
      const fired = await this.evaluateRule(rule, ctx, evidenceIds);
      if (fired) {
        triggeredRules.push(rule.ruleType);
        riskScoreIncrease += rule.riskScoreWeight;

        // Create/update compliance case (idempotent per user per rule per day)
        await this.complianceCaseService.createOrUpdateCase({
          userId: ctx.userId,
          ruleTriggered: rule.ruleType,
          evidenceTransactionIds: [...evidenceIds],
        });
      }
    }

    const flagged = triggeredRules.length > 0;
    if (flagged) {
      this.logger.warn(
        `AML rules triggered for user ${ctx.userId} tx ${ctx.transactionId}: ${triggeredRules.join(', ')}`,
      );
    }

    return { flagged, triggeredRules, riskScoreIncrease };
  }

  private async evaluateRule(
    rule: AmlRuleEntity,
    ctx: AmlEvaluationContext,
    evidenceIds: string[],
  ): Promise<boolean> {
    switch (rule.ruleType) {
      case 'STRUCTURING':
        return this.checkStructuring(rule, ctx, evidenceIds);
      case 'SMURFING':
        return this.checkSmurfing(rule, ctx, evidenceIds);
      case 'VELOCITY_BURST':
        return this.checkVelocityBurst(rule, ctx, evidenceIds);
      case 'CROSS_BORDER_THRESHOLD':
        return this.checkCrossBorderThreshold(rule, ctx);
      default:
        return false;
    }
  }

  /**
   * STRUCTURING: 3+ transactions by the same user in 24h totalling > reporting threshold
   */
  private async checkStructuring(
    rule: AmlRuleEntity,
    ctx: AmlEvaluationContext,
    evidenceIds: string[],
  ): Promise<boolean> {
    const windowHours = rule.thresholds['windowHours'] ?? 24;
    const minCount = rule.thresholds['minCount'] ?? 3;
    const threshold = rule.thresholds['amountThreshold'] ?? 10000;

    const since = new Date(ctx.createdAt.getTime() - windowHours * 60 * 60 * 1000);

    const rows: { id: string; amount: string }[] = await this.dataSource.query(
      `SELECT id, amount FROM transactions WHERE wallet_id = $1 AND created_at > $2`,
      [ctx.userId, since],
    );

    if (rows.length < minCount) return false;

    const total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    if (total < threshold) return false;

    rows.forEach((r) => {
      if (!evidenceIds.includes(r.id)) evidenceIds.push(r.id);
    });
    return true;
  }

  /**
   * SMURFING: same amount ±variance% across 3+ different destination wallets within window
   */
  private async checkSmurfing(
    rule: AmlRuleEntity,
    ctx: AmlEvaluationContext,
    evidenceIds: string[],
  ): Promise<boolean> {
    if (!ctx.toAddress) return false;

    const windowHours = rule.thresholds['windowHours'] ?? 1;
    const minWallets = rule.thresholds['minWallets'] ?? 3;
    const variancePct = rule.thresholds['variancePct'] ?? 5;

    const since = new Date(ctx.createdAt.getTime() - windowHours * 60 * 60 * 1000);
    const low = ctx.amount * (1 - variancePct / 100);
    const high = ctx.amount * (1 + variancePct / 100);

    const rows: { id: string; to_address: string }[] = await this.dataSource.query(
      `SELECT id, to_address FROM transactions
       WHERE wallet_id = $1
         AND created_at > $2
         AND CAST(amount AS DECIMAL) BETWEEN $3 AND $4
         AND to_address IS NOT NULL`,
      [ctx.userId, since, low, high],
    );

    const distinctDestinations = new Set(rows.map((r) => r.to_address));
    if (distinctDestinations.size < minWallets) return false;

    rows.forEach((r) => {
      if (!evidenceIds.includes(r.id)) evidenceIds.push(r.id);
    });
    return true;
  }

  /**
   * VELOCITY_BURST: >N transactions in window from the same user
   */
  private async checkVelocityBurst(
    rule: AmlRuleEntity,
    ctx: AmlEvaluationContext,
    evidenceIds: string[],
  ): Promise<boolean> {
    const windowHours = rule.thresholds['windowHours'] ?? 1;
    const maxCount = rule.thresholds['maxCount'] ?? 10;

    const since = new Date(ctx.createdAt.getTime() - windowHours * 60 * 60 * 1000);

    const rows: [{ count: string }] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM transactions WHERE wallet_id = $1 AND created_at > $2`,
      [ctx.userId, since],
    );

    const count = parseInt(rows[0].count, 10);
    return count > maxCount;
  }

  /**
   * CROSS_BORDER_THRESHOLD: transaction amount exceeds cross-border reporting threshold
   */
  private async checkCrossBorderThreshold(
    rule: AmlRuleEntity,
    ctx: AmlEvaluationContext,
  ): Promise<boolean> {
    const threshold = rule.thresholds['amountThreshold'] ?? 10000;
    return ctx.amount >= threshold;
  }

  // ─── Admin CRUD ────────────────────────────────────────────────────────────

  async findAll(): Promise<AmlRuleEntity[]> {
    return this.ruleRepo.find({ order: { ruleType: 'ASC' } });
  }

  async findOne(id: string): Promise<AmlRuleEntity> {
    return this.ruleRepo.findOneOrFail({ where: { id } });
  }

  async updateRule(
    id: string,
    update: Partial<Pick<AmlRuleEntity, 'enabled' | 'thresholds' | 'riskScoreWeight' | 'name' | 'description'>>,
  ): Promise<AmlRuleEntity> {
    const rule = await this.findOne(id);
    Object.assign(rule, update);
    return this.ruleRepo.save(rule);
  }

  async createRule(data: {
    ruleType: AmlRuleType;
    name: string;
    description?: string;
    enabled?: boolean;
    thresholds: Record<string, number>;
    riskScoreWeight?: number;
  }): Promise<AmlRuleEntity> {
    const rule = this.ruleRepo.create({
      ...data,
      enabled: data.enabled ?? true,
      riskScoreWeight: data.riskScoreWeight ?? 30,
    });
    return this.ruleRepo.save(rule);
  }

  // ─── Seed ──────────────────────────────────────────────────────────────────

  private async seedDefaultRules(): Promise<void> {
    const amlConfig = {
      structuringThreshold: this.configService.get<number>('aml.structuringThreshold') ?? 10000,
      structuringWindowHours: this.configService.get<number>('aml.structuringWindowHours') ?? 24,
      structuringMinCount: this.configService.get<number>('aml.structuringMinCount') ?? 3,
      smurfingWindowHours: this.configService.get<number>('aml.smurfingWindowHours') ?? 1,
      smurfingMinWallets: this.configService.get<number>('aml.smurfingMinWallets') ?? 3,
      smurfingVariancePct: this.configService.get<number>('aml.smurfingAmountVariancePct') ?? 5,
      velocityBurstWindowHours: this.configService.get<number>('aml.velocityBurstWindowHours') ?? 1,
      velocityBurstMaxCount: this.configService.get<number>('aml.velocityBurstMaxCount') ?? 10,
      riskScoreWeight: this.configService.get<number>('aml.riskScoreWeight') ?? 30,
    };

    const defaults: Array<{
      ruleType: AmlRuleType;
      name: string;
      description: string;
      thresholds: Record<string, number>;
    }> = [
      {
        ruleType: 'STRUCTURING',
        name: 'Structuring Detection',
        description:
          '3+ transactions in 24h totalling above the reporting threshold flags the user',
        thresholds: {
          amountThreshold: amlConfig.structuringThreshold,
          windowHours: amlConfig.structuringWindowHours,
          minCount: amlConfig.structuringMinCount,
        },
      },
      {
        ruleType: 'SMURFING',
        name: 'Smurfing Detection',
        description:
          'Same amount ±5% across 3+ different wallets within 1 hour flagged',
        thresholds: {
          windowHours: amlConfig.smurfingWindowHours,
          minWallets: amlConfig.smurfingMinWallets,
          variancePct: amlConfig.smurfingVariancePct,
        },
      },
      {
        ruleType: 'VELOCITY_BURST',
        name: 'Velocity Burst Detection',
        description: '>10 transactions in 1 hour from the same user flagged',
        thresholds: {
          windowHours: amlConfig.velocityBurstWindowHours,
          maxCount: amlConfig.velocityBurstMaxCount,
        },
      },
      {
        ruleType: 'CROSS_BORDER_THRESHOLD',
        name: 'Cross-Border Threshold',
        description: 'Transaction amount exceeds cross-border reporting threshold',
        thresholds: {
          amountThreshold: amlConfig.structuringThreshold,
        },
      },
    ];

    for (const def of defaults) {
      const exists = await this.ruleRepo.findOne({ where: { ruleType: def.ruleType } });
      if (!exists) {
        await this.ruleRepo.save(
          this.ruleRepo.create({
            ...def,
            enabled: true,
            riskScoreWeight: amlConfig.riskScoreWeight,
          }),
        );
        this.logger.log(`Seeded AML rule: ${def.ruleType}`);
      }
    }
  }
}
