import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskState } from '../../risk-engine/entities/risk-state.entity';

export interface StrategyParameters {
  maxPositionSize: number;
  recommendedPositionSize: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxLeverage: number;
  notes: string[];
}

export interface OptimizationInput {
  userId: string;
  currencyPair: string;
  direction: 'LONG' | 'SHORT';
  capitalAvailable: number;
}

@Injectable()
export class StrategyManagerService {
  private readonly logger = new Logger(StrategyManagerService.name);

  constructor(
    @InjectRepository(RiskState)
    private readonly riskStateRepository: Repository<RiskState>,
  ) {}

  /**
   * Recommend strategy parameters for a given trade.
   * Per spec: reads maxPositionSize from RiskState before recommending parameters.
   * Position limit check re-reads from DB (not cache) for accuracy.
   */
  async recommendParameters(
    input: OptimizationInput,
  ): Promise<StrategyParameters> {
    const { userId, capitalAvailable } = input;

    // Re-read from DB per spec — no cache
    const riskState = await this.riskStateRepository.findOne({
      where: { userId },
    });

    const notes: string[] = [];

    // Default conservative limits if no risk profile exists
    const maxPositionSize = riskState?.maxPositionSize ?? 1000;
    const dailyLossLimit = riskState?.dailyLossLimit ?? 1000;
    const dailyLoss = riskState?.dailyLoss ?? 0;

    if (!riskState) {
      notes.push(
        'No risk profile found — using conservative default limits.',
      );
      this.logger.warn(
        `No RiskState found for user ${userId}; defaulting to conservative parameters`,
      );
    }

    // Circuit breaker check — surface warning even if guard already blocked
    if (riskState?.circuitBreakerActive) {
      notes.push(
        'Daily loss limit has been breached. New trades are currently suspended.',
      );
    }

    // Recommended size = min of (capital available, maxPositionSize from risk state)
    let recommendedPositionSize = Math.min(capitalAvailable, maxPositionSize);

    // Additional conservative scaling: if more than 80% of daily loss limit consumed,
    // reduce recommended size to 25% of max
    const dailyLossRatio = dailyLossLimit > 0 ? dailyLoss / dailyLossLimit : 0;
    if (dailyLossRatio >= 0.8) {
      recommendedPositionSize = recommendedPositionSize * 0.25;
      notes.push(
        `Daily loss at ${(dailyLossRatio * 100).toFixed(0)}% of limit — position size reduced to 25% of maximum.`,
      );
    } else if (dailyLossRatio >= 0.5) {
      recommendedPositionSize = recommendedPositionSize * 0.5;
      notes.push(
        `Daily loss at ${(dailyLossRatio * 100).toFixed(0)}% of limit — position size reduced to 50% of maximum.`,
      );
    }

    // Leverage scaling inversely with daily loss consumed
    const maxLeverage = dailyLossRatio >= 0.5 ? 1 : dailyLossRatio >= 0.25 ? 2 : 5;

    this.logger.log(
      `Strategy params for user ${userId}: recommended=${recommendedPositionSize}, maxPos=${maxPositionSize}`,
    );

    return {
      maxPositionSize,
      recommendedPositionSize: Math.max(0, recommendedPositionSize),
      stopLossPercent: 1.5,
      takeProfitPercent: 3.0,
      maxLeverage,
      notes,
    };
  }

  /**
   * Validate a proposed trade size against current risk limits.
   * Re-reads from DB for accuracy.
   */
  async validatePositionSize(
    userId: string,
    proposedSize: number,
  ): Promise<{ valid: boolean; reason?: string; maxAllowed: number }> {
    const riskState = await this.riskStateRepository.findOne({
      where: { userId },
    });

    const maxPositionSize = riskState?.maxPositionSize ?? 0;

    if (proposedSize > maxPositionSize) {
      return {
        valid: false,
        reason: `Proposed size ${proposedSize} exceeds risk limit of ${maxPositionSize}`,
        maxAllowed: maxPositionSize,
      };
    }

    return { valid: true, maxAllowed: maxPositionSize };
  }
}