import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiskState } from '../entities/risk-state.entity';
import { Trade } from '../../transactions/entities/trade.entity';

export interface RiskCheckResult {
  isAllowed: boolean;
  reason?: string;
  currentMetrics: {
    dailyLoss: number;
    dailyLossLimit: number;
    openPositions: number;
    maxPositionSize: number;
    circuitBreakerActive: boolean;
  };
}

@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);

  constructor(
    @InjectRepository(RiskState)
    private readonly riskStateRepository: Repository<RiskState>,
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Refresh the persisted RiskState by recomputing from live trade data.
   * Must be called after every trade completion.
   */
  async refreshRiskState(userId: string): Promise<RiskState> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      // Re-read from DB (not cache) for accuracy per spec
      const todayTrades = await queryRunner.manager.find(Trade, {
        where: {
          userId,
          completedAt: { $gte: startOfDay } as any,
          status: 'COMPLETED',
        },
      });

      const dailyLoss = todayTrades
        .filter((t) => t.pnl < 0)
        .reduce((sum, t) => sum + Math.abs(t.pnl), 0);

      const openPositions = await queryRunner.manager.count(Trade, {
        where: { userId, status: 'OPEN' },
      });

      let riskState = await queryRunner.manager.findOne(RiskState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!riskState) {
        riskState = queryRunner.manager.create(RiskState, {
          userId,
          dailyLoss: 0,
          openPositions: 0,
          circuitBreakerActive: false,
        });
      }

      riskState.dailyLoss = dailyLoss;
      riskState.openPositions = openPositions;
      riskState.circuitBreakerActive =
        dailyLoss >= riskState.dailyLossLimit;
      riskState.lastRefreshedAt = new Date();

      await queryRunner.manager.save(RiskState, riskState);
      await queryRunner.commitTransaction();

      this.logger.log(
        `RiskState refreshed for user ${userId}: dailyLoss=${dailyLoss}, circuitBreaker=${riskState.circuitBreakerActive}`,
      );

      return riskState;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to refresh risk state for ${userId}`, err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Read the current RiskState for a user directly from DB.
   */
  async getRiskState(userId: string): Promise<RiskState | null> {
    return this.riskStateRepository.findOne({ where: { userId } });
  }

  /**
   * Daily reset cron — runs at midnight UTC.
   * Resets daily loss counters and lifts circuit breakers for all users.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyLimits(): Promise<void> {
    this.logger.log('Running midnight UTC daily loss limit reset...');
    try {
      await this.riskStateRepository
        .createQueryBuilder()
        .update(RiskState)
        .set({
          dailyLoss: 0,
          circuitBreakerActive: false,
          lastResetAt: new Date(),
        })
        .execute();

      this.logger.log('Daily loss limits reset successfully for all users.');
    } catch (err) {
      this.logger.error('Failed to reset daily loss limits', err);
      throw err;
    }
  }

  /**
   * Manually lift circuit breaker for a specific user (admin action).
   */
  async liftCircuitBreaker(userId: string): Promise<void> {
    await this.riskStateRepository.update(
      { userId },
      { circuitBreakerActive: false },
    );
    this.logger.warn(`Circuit breaker manually lifted for user ${userId}`);
  }
}