import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { RiskSnapshot } from '../entities/risk-snapshot.entity';
import { RiskState } from '../entities/risk-state.entity';
import { RiskPosition } from '../entities/risk-position.entity';
import { RiskCalculationService } from './risk-calculation.service';
import { StressTestService } from './stress-test.service';
import { WalletBalanceService } from '../../wallets/services/wallet-balance.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class RiskAnalyticsService {
  private readonly logger = new Logger(RiskAnalyticsService.name);

  constructor(
    @InjectRepository(RiskSnapshot)
    private readonly snapshotRepo: Repository<RiskSnapshot>,
    @InjectRepository(RiskState)
    private readonly stateRepo: Repository<RiskState>,
    @InjectRepository(RiskPosition)
    private readonly positionRepo: Repository<RiskPosition>,
    private readonly riskCalc: RiskCalculationService,
    private readonly stressTest: StressTestService,
    private readonly balanceService: WalletBalanceService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getPortfolioDashboard(userId: string) {
    // 1. Fetch latest data
    const [positions, portfolio, latestSnapshot] = await Promise.all([
      this.positionRepo.find({ where: { userId } }),
      this.balanceService.getPortfolio(userId),
      this.snapshotRepo.findOne({
        where: { userId },
        order: { timestamp: 'DESC' },
      }),
    ]);

    const equity = portfolio.totalInDisplayCurrency;

    // 2. Recalculate metrics from latest state
    const usedMargin = this.riskCalc.calculateUsedMargin(positions);
    const varValue = this.riskCalc.calculateVaR(positions);
    const totalExposure = this.riskCalc.calculateTotalExposure(positions);
    
    // Drawdown calculation (using latest snapshot as peak proxy for demo)
    const peakEquity = latestSnapshot ? Math.max(Number(latestSnapshot.equity), equity) : equity;
    const drawdown = this.riskCalc.calculateDrawdown(peakEquity, equity);

    const riskScore = this.riskCalc.calculateRiskScore({
      exposure: totalExposure,
      equity,
      var: varValue,
      drawdown,
    });

    // 3. Emit event if risk score changed significantly (> 10 points)
    if (latestSnapshot && Math.abs(riskScore - Number(latestSnapshot.riskScore)) > 10) {
      this.eventEmitter.emit('risk.scoreChanged', {
        userId,
        oldScore: latestSnapshot.riskScore,
        newScore: riskScore,
        timestamp: new Date(),
      });
    }

    // 4. Get 30-day trend
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trend = await this.snapshotRepo.find({
      where: { userId, timestamp: MoreThanOrEqual(since) },
      order: { timestamp: 'ASC' },
      select: ['timestamp', 'riskScore', 'var', 'equity'],
    });

    return {
      current: {
        riskScore,
        var: varValue,
        usedMargin,
        freeMargin: Math.max(0, equity - usedMargin),
        equity,
        totalExposure,
        drawdown,
        updatedAt: new Date(),
      },
      trend,
    };
  }

  async getStressTestResults(userId: string) {
    const [positions, portfolio] = await Promise.all([
      this.positionRepo.find({ where: { userId } }),
      this.balanceService.getPortfolio(userId),
    ]);

    return this.stressTest.runStandardScenarios(
      positions,
      portfolio.totalInDisplayCurrency,
    );
  }

  async getTopRiskUsers(limit = 10) {
    // Get latest snapshot for each user, order by riskScore desc
    return this.snapshotRepo.query(`
      SELECT DISTINCT ON ("userId") 
        "userId", "riskScore", "var", "equity", "timestamp"
      FROM risk_snapshots
      ORDER BY "userId", "timestamp" DESC
      LIMIT $1
    `, [limit]);
  }

  async triggerOnDemandStressTest(userId: string) {
    const results = await this.getStressTestResults(userId);
    this.logger.log(`On-demand stress test completed for user ${userId}`);
    return {
      userId,
      timestamp: new Date(),
      results,
    };
  }
}
