import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionRiskScoreEntity } from '../../entities/transaction-risk-score.entity';
import {
  RiskCheckContext,
  RiskCheckResult,
} from '../../interfaces/risk-check.interface';

// How many transactions in a short window is suspicious
const VELOCITY_WINDOW_MINUTES = 10;
const VELOCITY_THRESHOLD = 5;
const VELOCITY_SCORE = 30;

@Injectable()
export class VelocityCheck {
  private readonly logger = new Logger(VelocityCheck.name);

  constructor(
    @InjectRepository(TransactionRiskScoreEntity)
    private readonly riskRepo: Repository<TransactionRiskScoreEntity>,
  ) {}

  async run(context: RiskCheckContext): Promise<RiskCheckResult> {
    if (!context.userId) {
      return {
        checkName: 'VELOCITY',
        triggered: false,
        score: 0,
        reason: 'No userId provided',
      };
    }

    const windowStart = new Date(
      Date.now() - VELOCITY_WINDOW_MINUTES * 60 * 1000,
    );

    const recentCount = await this.riskRepo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId: context.userId })
      .andWhere('r.createdAt >= :windowStart', { windowStart })
      .getCount();

    const triggered = recentCount >= VELOCITY_THRESHOLD;

    this.logger.debug(
      `Velocity check for user ${context.userId}: ${recentCount} transactions in ${VELOCITY_WINDOW_MINUTES}min window`,
    );

    return {
      checkName: 'VELOCITY',
      triggered,
      score: triggered ? VELOCITY_SCORE : 0,
      reason: triggered
        ? `${recentCount} transactions in the last ${VELOCITY_WINDOW_MINUTES} minutes (threshold: ${VELOCITY_THRESHOLD})`
        : `Normal transaction velocity (${recentCount} in ${VELOCITY_WINDOW_MINUTES}min)`,
    };
  }
}
