import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionRiskEntity, RiskLevel } from '../../transactions/entities/transaction-risk.entity';

export type IndicatorName =
  | 'HIGH_VELOCITY'
  | 'UNUSUAL_DESTINATIONS'
  | 'REPEATED_FAILURES'
  | 'LARGE_TRANSACTION_SPIKE'
  | 'NEW_WALLET_HIGH_ACTIVITY'
  | 'SUSPICIOUS_PATTERNS';

export interface RiskIndicatorResult {
  indicator: IndicatorName;
  weight: number;
  description: string;
  triggered: boolean;
  metadata?: Record<string, any>;
}

@Injectable()
export class RiskIndicatorsService {
  private readonly logger = new Logger(RiskIndicatorsService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionRiskEntity)
    private readonly txRiskRepo: Repository<TransactionRiskEntity>,
  ) {}

  async evaluateTransaction(transactionId: string): Promise<TransactionRiskEntity> {
    const transaction = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!transaction) throw new Error(`Transaction not found: ${transactionId}`);

    const indicators = await this.evaluateAllIndicators(transaction);
    const totalScore = indicators.reduce((sum, i) => sum + i.weight, 0);
    const riskLevel = this.toRiskLevel(totalScore);
    const isFlagged = totalScore >= 70;

    let riskRecord = await this.txRiskRepo.findOne({ where: { transactionId } });
    if (!riskRecord) {
      riskRecord = this.txRiskRepo.create({ transactionId });
    }

    riskRecord.riskScore = totalScore;
    riskRecord.riskLevel = riskLevel;
    riskRecord.isFlagged = isFlagged;
    riskRecord.riskFactors = indicators.map((i) => ({
      rule: i.indicator,
      score: i.weight,
      description: i.description,
      metadata: i.metadata,
    }));
    riskRecord.riskEvaluatedAt = new Date();
    riskRecord.flaggedAt = isFlagged ? riskRecord.flaggedAt ?? new Date() : riskRecord.flaggedAt;
    riskRecord.flagReason = isFlagged ? riskRecord.flagReason ?? 'AUTO_FLAGGED_BY_INDICATORS' : riskRecord.flagReason;

    await this.txRiskRepo.save(riskRecord);

    // Also project onto transaction row for quick lookups
    await this.txRepo.update(
      { id: transactionId },
      {
        riskScore: totalScore,
        isFlagged,
        riskEvaluatedAt: new Date(),
        requiresManualReview: isFlagged,
      },
    );

    return riskRecord;
  }

  async evaluateAllIndicators(transaction: TransactionEntity): Promise<RiskIndicatorResult[]> {
    const [velocity, destinations, failures, spike, newWallet, patterns] = await Promise.all([
      this.checkTransactionVelocity(transaction),
      this.checkUnusualDestinations(transaction),
      this.checkRepeatedFailures(transaction),
      this.checkLargeTransactionSpike(transaction),
      this.checkNewWalletActivity(transaction),
      this.checkSuspiciousPatterns(transaction),
    ]);

    return [velocity, destinations, failures, spike, newWallet, patterns];
  }

  private async checkTransactionVelocity(tx: TransactionEntity): Promise<RiskIndicatorResult> {
    const windowHours = 24;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const count = await this.txRepo.count({
      where: {
        walletId: tx.walletId,
        createdAt: MoreThan(since),
      },
    });

    const threshold = 20;
    const triggered = !!tx.walletId && count > threshold;

    return {
      indicator: 'HIGH_VELOCITY',
      triggered,
      weight: triggered ? 25 : 0,
      description: `${count} transactions for wallet ${tx.walletId ?? 'n/a'} in last ${windowHours}h (threshold > ${threshold})`,
      metadata: { count, windowHours },
    };
  }

  private async checkUnusualDestinations(tx: TransactionEntity): Promise<RiskIndicatorResult> {
    if (!tx.walletId || !tx.toAddress) {
      return {
        indicator: 'UNUSUAL_DESTINATIONS',
        triggered: false,
        weight: 0,
        description: 'No destination data available',
      };
    }

    const now = new Date();
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [recentDistinct, baselineDistinct] = await Promise.all([
      this.txRepo
        .createQueryBuilder('t')
        .select('COUNT(DISTINCT t.toAddress)', 'cnt')
        .where('t.walletId = :walletId', { walletId: tx.walletId })
        .andWhere('t.toAddress IS NOT NULL')
        .andWhere('t.createdAt BETWEEN :start AND :end', { start: last30Start, end: now })
        .getRawOne<{ cnt: string }>(),
      this.txRepo
        .createQueryBuilder('t')
        .select('COUNT(DISTINCT t.toAddress)', 'cnt')
        .where('t.walletId = :walletId', { walletId: tx.walletId })
        .andWhere('t.toAddress IS NOT NULL')
        .andWhere('t.createdAt BETWEEN :start AND :end', {
          start: prev30Start,
          end: last30Start,
        })
        .getRawOne<{ cnt: string }>(),
    ]);

    const currentDistinct = Number(recentDistinct?.cnt ?? 0);
    const baseline = Math.max(Number(baselineDistinct?.cnt ?? 0), 1); // avoid div by zero
    const ratio = currentDistinct / baseline;
    const triggered = currentDistinct >= 5 && ratio >= 1.5;

    return {
      indicator: 'UNUSUAL_DESTINATIONS',
      triggered,
      weight: triggered ? 20 : 0,
      description: `${currentDistinct} distinct destinations in 30d vs baseline ${baseline} (x${ratio.toFixed(2)})`,
      metadata: { currentDistinct, baseline, ratio },
    };
  }

  private async checkRepeatedFailures(tx: TransactionEntity): Promise<RiskIndicatorResult> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedCount = await this.txRepo.count({
      where: {
        walletId: tx.walletId,
        status: 'FAILED',
        createdAt: MoreThan(since),
      },
    });

    const threshold = 3;
    const triggered = !!tx.walletId && failedCount > threshold;

    return {
      indicator: 'REPEATED_FAILURES',
      triggered,
      weight: triggered ? 15 : 0,
      description: `${failedCount} failed tx in last 24h (threshold > ${threshold})`,
      metadata: { failedCount },
    };
  }

  private async checkLargeTransactionSpike(tx: TransactionEntity): Promise<RiskIndicatorResult> {
    if (!tx.walletId) {
      return {
        indicator: 'LARGE_TRANSACTION_SPIKE',
        triggered: false,
        weight: 0,
        description: 'No wallet context for spike analysis',
      };
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { avg } = await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(AVG(t.amount), 0)', 'avg')
      .where('t.walletId = :walletId', { walletId: tx.walletId })
      .andWhere('t.createdAt >= :since', { since })
      .andWhere('t.id != :id', { id: tx.id })
      .getRawOne<{ avg: string }>();

    const average = Number(avg ?? 0);
    const thresholdMultiplier = 3;
    const triggered = average > 0 ? Number(tx.amount) >= average * thresholdMultiplier : false;

    return {
      indicator: 'LARGE_TRANSACTION_SPIKE',
      triggered,
      weight: triggered ? 25 : 0,
      description: average
        ? `Amount ${tx.amount} vs 30d avg ${average.toFixed(2)} (>=${thresholdMultiplier}x)`
        : 'Insufficient history for spike detection',
      metadata: { average, multiplier: thresholdMultiplier },
    };
  }

  private async checkNewWalletActivity(tx: TransactionEntity): Promise<RiskIndicatorResult> {
    if (!tx.walletId) {
      return {
        indicator: 'NEW_WALLET_HIGH_ACTIVITY',
        triggered: false,
        weight: 0,
        description: 'No wallet context',
      };
    }

    const oldest = await this.txRepo.findOne({
      where: { walletId: tx.walletId },
      order: { createdAt: 'ASC' },
      select: ['createdAt'],
    });

    const totalCount = await this.txRepo.count({ where: { walletId: tx.walletId } });
    const walletAgeDays = oldest
      ? Math.max(1, Math.floor((Date.now() - oldest.createdAt.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    const triggered = walletAgeDays <= 7 && totalCount >= 15;

    return {
      indicator: 'NEW_WALLET_HIGH_ACTIVITY',
      triggered,
      weight: triggered ? 10 : 0,
      description: `Wallet age ${walletAgeDays}d with ${totalCount} tx (>=15 within first week)`,
      metadata: { walletAgeDays, totalCount },
    };
  }

  private async checkSuspiciousPatterns(tx: TransactionEntity): Promise<RiskIndicatorResult> {
    if (!tx.walletId) {
      return {
        indicator: 'SUSPICIOUS_PATTERNS',
        triggered: false,
        weight: 0,
        description: 'No wallet context',
      };
    }

    const recent = await this.txRepo.find({
      where: { walletId: tx.walletId },
      order: { createdAt: 'DESC' },
      take: 12,
    });

    const roundAmounts = recent.filter((r) => Number(r.amount) % 100 === 0).length;
    const timestamps = recent.map((r) => r.createdAt.getTime()).sort((a, b) => a - b);
    const deltas = timestamps.slice(1).map((t, idx) => t - timestamps[idx]);
    const avgDelta = deltas.length
      ? deltas.reduce((a, b) => a + b, 0) / deltas.length
      : 0;
    const deviation = deltas.length
      ? Math.sqrt(
          deltas.reduce((sum, d) => sum + Math.pow(d - avgDelta, 2), 0) / deltas.length,
        )
      : 0;

    const roundPattern = roundAmounts >= Math.max(5, Math.ceil(recent.length * 0.6));
    const intervalPattern = deltas.length >= 3 && deviation < 60 * 1000; // within 1 minute variance
    const triggered = roundPattern || intervalPattern;

    return {
      indicator: 'SUSPICIOUS_PATTERNS',
      triggered,
      weight: triggered ? 15 : 0,
      description: `Round amounts: ${roundAmounts}/${recent.length}; interval stddev ${Math.round(
        deviation / 1000,
      )}s`,
      metadata: { roundAmounts, sample: recent.length, deviationMs: deviation },
    };
  }

  private toRiskLevel(score: number): RiskLevel {
    if (score >= 90) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }
}
