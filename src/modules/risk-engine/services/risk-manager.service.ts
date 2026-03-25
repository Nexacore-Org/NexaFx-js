import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskState } from '../entities/risk-state.entity';
import { RiskPosition } from '../entities/risk-position.entity';
import { RiskSnapshot } from '../entities/risk-snapshot.entity';
import { RiskCalculationService } from './risk-calculation.service';
import { StressTestService } from './stress-test.service';
import {
  POSITION_CHANGE_THRESHOLD,
  POSITION_SIGNIFICANT_CHANGE_EVENT,
} from '../../../web-sockets/market-feed.constants';

@Injectable()
export class RiskManagerService {
  constructor(
    @InjectRepository(RiskState)
    private readonly riskStateRepo: Repository<RiskState>,
    @InjectRepository(RiskPosition)
    private readonly positionRepo: Repository<RiskPosition>,
    @InjectRepository(RiskSnapshot)
    private readonly snapshotRepo: Repository<RiskSnapshot>,
    private readonly riskCalc: RiskCalculationService,
    private readonly stressTest: StressTestService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getRiskState(userId: string): Promise<RiskState> {
    const riskState = await this.riskStateRepo.findOne({ where: { userId } });
    if (!riskState) {
      throw new NotFoundException(`Risk profile not found for user ${userId}`);
    }
    return riskState;
  }

  async createRiskProfile(userId: string): Promise<RiskState> {
    const riskState = this.riskStateRepo.create({ userId });
    return this.riskStateRepo.save(riskState);
  }

  async updateRiskMetrics(userId: string): Promise<RiskState> {
    let riskState = await this.riskStateRepo.findOne({ where: { userId } });
    if (!riskState) {
      riskState = await this.createRiskProfile(userId);
    }

    const previousExposure = this.calculateCurrentExposure(riskState);
    const positions = await this.positionRepo.find({ where: { userId } });

    // Calculate Metrics
    const totalExposure = this.riskCalc.calculateTotalExposure(positions);
    const usedMargin = this.riskCalc.calculateUsedMargin(positions);
    const currentVaR = this.riskCalc.calculateVaR(positions);

    // Assume equity is updated elsewhere or passed in. For now, we use existing equity.
    // In a real system, equity = balance + unrealized PnL.
    // We can calculate unrealized PnL here if we have entry prices.
    const unrealizedPnL = positions.reduce((sum, pos) => {
      const value = Number(pos.quantity) * Number(pos.currentPrice);
      const cost = Number(pos.quantity) * Number(pos.entryPrice);
      return sum + (pos.side === 'BUY' ? value - cost : cost - value);
    }, 0);

    // Update risk state
    riskState.currentVaR = currentVaR;
    riskState.usedMargin = usedMargin;
    riskState.freeMargin = riskState.totalEquity - usedMargin;
    riskState.currentDailyPL = unrealizedPnL; // Simplified
    riskState.exposureBreakdown = this.buildExposureBreakdown(positions);

    // Calculate Risk Score
    const score = this.riskCalc.calculateRiskScore({
      exposure: totalExposure,
      equity: riskState.totalEquity,
      var: currentVaR,
      drawdown: riskState.maxDrawdown,
    });
    riskState.riskScore = score;

    await this.riskStateRepo.save(riskState);

    // Create Snapshot for history
    const snapshot = this.snapshotRepo.create({
      userId,
      equity: riskState.totalEquity,
      margin: usedMargin,
      dailyPL: unrealizedPnL,
      var: currentVaR,
      maxDrawdown: riskState.maxDrawdown,
      riskScore: score,
      metrics: {
        exposureByAsset: {}, // TODO: Implement breakdown
        leverage: totalExposure / (riskState.totalEquity || 1),
      },
    });
    await this.snapshotRepo.save(snapshot);
    this.emitPositionChangeIfSignificant(userId, positions, previousExposure, totalExposure);

    return riskState;
  }

  async runStressTest(userId: string): Promise<any> {
    const riskState = await this.getRiskState(userId);
    const positions = await this.positionRepo.find({ where: { userId } });
    return this.stressTest.runStandardScenarios(
      positions,
      riskState.totalEquity,
    );
  }

  async updateLimits(userId: string, limits: any): Promise<RiskState> {
    const riskState = await this.getRiskState(userId);
    riskState.limits = { ...riskState.limits, ...limits };
    return this.riskStateRepo.save(riskState);
  }

  private calculateCurrentExposure(riskState: RiskState): number {
    const exposures = Object.values(riskState.exposureBreakdown ?? {});
    return exposures.reduce((sum, value) => sum + Math.abs(Number(value)), 0);
  }

  private buildExposureBreakdown(positions: RiskPosition[]): Record<string, number> {
    return positions.reduce<Record<string, number>>((acc, position) => {
      const positionValue = Number(position.quantity) * Number(position.currentPrice);
      const signedValue = position.side === 'BUY' ? positionValue : -positionValue;
      acc[position.symbol] = (acc[position.symbol] ?? 0) + signedValue;
      return acc;
    }, {});
  }

  private emitPositionChangeIfSignificant(
    userId: string,
    positions: RiskPosition[],
    previousExposure: number,
    totalExposure: number,
  ): void {
    const baseline = Math.max(Math.abs(previousExposure), 1);
    const changeRatio = Math.abs(totalExposure - previousExposure) / baseline;

    if (changeRatio <= POSITION_CHANGE_THRESHOLD) {
      return;
    }

    this.eventEmitter.emit(POSITION_SIGNIFICANT_CHANGE_EVENT, {
      userId,
      totalExposure,
      previousTotalExposure: previousExposure,
      changeRatio,
      positions: positions.map((position) => ({
        id: position.id,
        symbol: position.symbol,
        quantity: Number(position.quantity),
        entryPrice: Number(position.entryPrice),
        currentPrice: Number(position.currentPrice),
        leverage: Number(position.leverage),
        side: position.side,
        assetType: position.assetType,
      })),
      timestamp: new Date().toISOString(),
    });
  }
}
