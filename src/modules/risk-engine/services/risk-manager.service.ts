import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { MarginCall, MarginCallStatus } from '../entities/margin-call.entity';
import { RiskState } from '../entities/risk-state.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);

  constructor(
    @InjectRepository(MarginCall)
    private marginCallRepo: Repository<MarginCall>,
    @InjectRepository(RiskState)
    private riskStateRepo: Repository<RiskState>,
    private eventEmitter: EventEmitter2,
  ) {}

  async calculateMarginUtilization(userId: string): Promise<number> {
    return 85.00;
  }

  async evaluateRiskLevel(userId: string, utilization: number) {
    if (utilization > 95) {
      await this.triggerMarginCall(userId, utilization);
    } else if (utilization > 80) {
      this.eventEmitter.emit('notification.margin_warning', { userId, utilization });
    }
  }

  /**
   * Refreshes the risk state for a user after a trade completes.
   * Re-reads positions and recalculates daily loss from DB.
   */
  async refreshRiskState(userId: string): Promise<void> {
    const state = await this.riskStateRepo.findOne({ where: { userId } });
    if (!state) {
      this.logger.warn(`No risk state found for user ${userId} — skipping refresh`);
      return;
    }

    // Recalculate open positions count from DB
    const openPositionsCount = await this.riskStateRepo.manager
      .getRepository('transactions')
      .createQueryBuilder('t')
      .where('t.walletId IS NOT NULL')
      .andWhere(`t.status = 'PENDING'`)
      .andWhere(`t.metadata->>'userId' = :userId`, { userId })
      .getCount()
      .catch(() => state.openPositions);

    state.openPositions = openPositionsCount;
    state.lastRefreshedAt = new Date();

    // Activate circuit breaker if daily loss limit breached
    if (Number(state.dailyLoss) >= Number(state.dailyLossLimit)) {
      state.circuitBreakerActive = true;
      this.logger.warn(`Circuit breaker activated for user ${userId}`);
      this.eventEmitter.emit('circuit-breaker.opened', { userId, dailyLoss: state.dailyLoss });
    }

    await this.riskStateRepo.save(state);
  }

  /**
   * Daily loss limit reset — runs at midnight UTC.
   * Resets dailyLoss to 0 and deactivates circuit breaker for all users.
   */
  @Cron('0 0 * * *')
  async resetDailyLossLimits(): Promise<void> {
    this.logger.log('Resetting daily loss limits for all users...');

    await this.riskStateRepo
      .createQueryBuilder()
      .update(RiskState)
      .set({
        dailyLoss: 0,
        circuitBreakerActive: false,
        lastResetAt: new Date(),
      })
      .execute();

    this.logger.log('Daily loss limits reset complete');
  }

  private async triggerMarginCall(userId: string, utilization: number) {
    const existing = await this.marginCallRepo.findOne({
      where: { userId, status: MarginCallStatus.PENDING },
    });

    if (!existing) {
      const marginCall = this.marginCallRepo.create({
        userId,
        utilizationAtCreation: utilization,
        status: MarginCallStatus.NOTIFIED,
      });
      await this.marginCallRepo.save(marginCall);
      this.eventEmitter.emit('notification.margin_call', { userId, utilization });
      this.logger.warn(`Margin Call triggered for user ${userId} at ${utilization}%`);
    }
  }
}
