import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../../../transactions/entities/transaction.entity';
import {
  RiskCheckContext,
  RiskCheckResult,
} from '../../interfaces/risk-check.interface';

// Volume spike: current transaction is N times the user's average
const SPIKE_MULTIPLIER = 5;
const VOLUME_SPIKE_SCORE = 35;
const LOOKBACK_DAYS = 30;

@Injectable()
export class VolumeSpikeCheck {
  private readonly logger = new Logger(VolumeSpikeCheck.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async run(context: RiskCheckContext): Promise<RiskCheckResult> {
    if (!context.userId) {
      return {
        checkName: 'VOLUME_SPIKE',
        triggered: false,
        score: 0,
        reason: 'No userId provided',
      };
    }

    const lookbackDate = new Date(
      Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    // Get the average transaction amount for this user over the lookback period.
    // TransactionEntity doesn't store userId directly, so we use metadata->>'userId'
    const result = await this.txRepo
      .createQueryBuilder('t')
      .select('AVG(CAST(t.amount AS FLOAT))', 'avg')
      .where("t.metadata->>'userId' = :userId", { userId: context.userId })
      .andWhere('t.createdAt >= :lookbackDate', { lookbackDate })
      .andWhere('t.status = :status', { status: 'SUCCESS' })
      .getRawOne();

    const avg = parseFloat(result?.avg ?? '0');

    if (avg === 0) {
      // No historical data, flag conservatively if amount is large
      const triggered = context.amount > 10000;
      return {
        checkName: 'VOLUME_SPIKE',
        triggered,
        score: triggered ? VOLUME_SPIKE_SCORE : 0,
        reason: triggered
          ? `Large amount (${context.amount} ${context.currency}) with no transaction history`
          : 'No transaction history to compare against',
      };
    }

    const ratio = context.amount / avg;
    const triggered = ratio >= SPIKE_MULTIPLIER;

    this.logger.debug(
      `Volume spike check: amount=${context.amount}, avg=${avg.toFixed(2)}, ratio=${ratio.toFixed(2)}x`,
    );

    return {
      checkName: 'VOLUME_SPIKE',
      triggered,
      score: triggered ? VOLUME_SPIKE_SCORE : 0,
      reason: triggered
        ? `Transaction amount (${context.amount} ${context.currency}) is ${ratio.toFixed(1)}x above the ${LOOKBACK_DAYS}-day average of ${avg.toFixed(2)}`
        : `Amount within normal range (${ratio.toFixed(1)}x of average)`,
    };
  }
}
