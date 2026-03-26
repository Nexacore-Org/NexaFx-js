import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskManagerService } from '../services/risk-manager.service';
import { RiskState } from '../entities/risk-state.entity';

export const TRADE_COMPLETED_EVENT = 'trade.completed';

export interface TradeCompletedPayload {
  tradeId: string;
  userId: string;
  pnl: number;
}

@Injectable()
export class RiskRefreshJob {
  private readonly logger = new Logger(RiskRefreshJob.name);

  constructor(
    private readonly riskManagerService: RiskManagerService,
    @InjectRepository(RiskState)
    private readonly riskStateRepository: Repository<RiskState>,
  ) {}

  /**
   * Called after every trade completion via event emitter.
   * Per spec: RiskManagerService.refreshRiskState() called after every trade completion.
   */
  @OnEvent(TRADE_COMPLETED_EVENT)
  async handleTradeCompleted(payload: TradeCompletedPayload): Promise<void> {
    this.logger.log(
      `Trade completed event received for user ${payload.userId}, trade ${payload.tradeId}. Refreshing risk state...`,
    );

    try {
      await this.riskManagerService.refreshRiskState(payload.userId);
      this.logger.log(
        `Risk state refreshed after trade ${payload.tradeId} for user ${payload.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to refresh risk state after trade ${payload.tradeId}`,
        err,
      );
      // Do not re-throw — trade is already complete, we log and alert
    }
  }

  /**
   * Periodic safety net — refresh all active users every 5 minutes
   * in case event delivery is missed.
   */
  @Cron('*/5 * * * *')
  async periodicRiskRefresh(): Promise<void> {
    this.logger.debug('Running periodic risk state refresh...');

    try {
      const activeUserIds = await this.riskStateRepository
        .createQueryBuilder('rs')
        .select('rs.userId')
        .where('rs.isActive = :active', { active: true })
        .getMany();

      await Promise.allSettled(
        activeUserIds.map((rs) =>
          this.riskManagerService.refreshRiskState(rs.userId),
        ),
      );

      this.logger.debug(
        `Periodic refresh completed for ${activeUserIds.length} users`,
      );
    } catch (err) {
      this.logger.error('Periodic risk refresh failed', err);
    }
  }
}