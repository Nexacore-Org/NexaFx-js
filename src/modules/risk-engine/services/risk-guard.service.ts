import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskState } from '../entities/risk-state.entity';
import { RiskCheckResult } from './risk-manager.service';

export interface TradeRiskInput {
  userId: string;
  tradeSize: number;
  currencyPair: string;
}

@Injectable()
export class RiskGuardService {
  private readonly logger = new Logger(RiskGuardService.name);

  constructor(
    @InjectRepository(RiskState)
    private readonly riskStateRepository: Repository<RiskState>,
  ) {}

  /**
   * Synchronous-style risk gate — reads fresh from DB per spec.
   * Called in the transaction creation request path.
   */
  async checkTradeRisk(input: TradeRiskInput): Promise<RiskCheckResult> {
    const { userId, tradeSize } = input;

    // Always re-read from DB (not cache) for accuracy
    const riskState = await this.riskStateRepository.findOne({
      where: { userId },
    });

    if (!riskState) {
      // No risk profile — deny by default (fail-safe)
      return {
        isAllowed: false,
        reason: 'No risk profile found for this user. Contact support.',
        currentMetrics: {
          dailyLoss: 0,
          dailyLossLimit: 0,
          openPositions: 0,
          maxPositionSize: 0,
          circuitBreakerActive: false,
        },
      };
    }

    const metrics = {
      dailyLoss: riskState.dailyLoss,
      dailyLossLimit: riskState.dailyLossLimit,
      openPositions: riskState.openPositions,
      maxPositionSize: riskState.maxPositionSize,
      circuitBreakerActive: riskState.circuitBreakerActive,
    };

    // Check 1: Daily loss circuit breaker
    if (riskState.circuitBreakerActive) {
      this.logger.warn(
        `Trade blocked for user ${userId} — daily loss circuit breaker active`,
      );
      return {
        isAllowed: false,
        reason:
          'Daily loss limit breached. All trading is suspended until midnight UTC reset.',
        currentMetrics: metrics,
      };
    }

    // Check 2: Would this trade itself breach the daily loss limit?
    // Conservative: if remaining headroom < tradeSize, block
    const remainingHeadroom = riskState.dailyLossLimit - riskState.dailyLoss;
    if (tradeSize > remainingHeadroom) {
      this.logger.warn(
        `Trade blocked for user ${userId} — trade size ${tradeSize} exceeds remaining daily headroom ${remainingHeadroom}`,
      );
      return {
        isAllowed: false,
        reason: `Trade size exceeds remaining daily loss headroom of ${remainingHeadroom.toFixed(2)}.`,
        currentMetrics: metrics,
      };
    }

    // Check 3: Position size limit (re-read from DB per spec)
    if (tradeSize > riskState.maxPositionSize) {
      this.logger.warn(
        `Trade blocked for user ${userId} — size ${tradeSize} exceeds maxPositionSize ${riskState.maxPositionSize}`,
      );
      return {
        isAllowed: false,
        reason: `Trade size ${tradeSize} exceeds maximum allowed position size of ${riskState.maxPositionSize}.`,
        currentMetrics: metrics,
      };
    }

    // Check 4: Max open positions
    if (riskState.openPositions >= riskState.maxOpenPositions) {
      this.logger.warn(
        `Trade blocked for user ${userId} — open positions ${riskState.openPositions} at max ${riskState.maxOpenPositions}`,
      );
      return {
        isAllowed: false,
        reason: `Maximum number of open positions (${riskState.maxOpenPositions}) reached.`,
        currentMetrics: metrics,
      };
    }

    return {
      isAllowed: true,
      currentMetrics: metrics,
    };
  }
}