import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Strategy } from '../entities/strategy.entity';
import { StrategyVersion } from '../entities/strategy-version.entity';
import { OptimizationService } from './optimization.service';
import { RegimeDetectionService } from './regime-detection.service';
import { MetricsCollectorService } from './metrics-collector.service';

@Injectable()
export class StrategyManagerService {
  private readonly logger = new Logger(StrategyManagerService.name);

  constructor(
    @InjectRepository(Strategy)
    private readonly strategyRepo: Repository<Strategy>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepo: Repository<StrategyVersion>,
    private readonly optimizationService: OptimizationService,
    private readonly regimeService: RegimeDetectionService,
    private readonly metricsService: MetricsCollectorService,
  ) {}

  async evaluateAndAdapt(
    strategyId: string,
    historicalData: any[],
  ): Promise<void> {
    const strategy = await this.strategyRepo.findOne({
      where: { id: strategyId },
      relations: ['parameters', 'versions', 'metrics'],
    });

    if (!strategy) {
      this.logger.error(`Strategy with ID ${strategyId} not found`);
      return;
    }

    // 1. Detect Regime
    const prices = historicalData.map((d) => d.close); // Assuming data structure
    const currentRegime = this.regimeService.detectRegime(prices);
    this.logger.log(`Current regime for ${strategy.name}: ${currentRegime}`);

    // 2. Check Performance (simplified check)
    // In a real scenario, we'd check if metrics are deteriorating
    const recentMetrics = strategy.metrics.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    )[0];

    let needsOptimization = false;
    if (!recentMetrics || recentMetrics.regime !== currentRegime) {
      this.logger.log(
        `Regime shift detected (${recentMetrics?.regime} -> ${currentRegime}). Triggering optimization.`,
      );
      needsOptimization = true;
    } else if (recentMetrics.roi < 0.05) {
      // Threshold for "poor performance"
      this.logger.log(
        `Performance degradation detected (ROI: ${recentMetrics.roi}). Triggering optimization.`,
      );
      needsOptimization = true;
    }

    if (needsOptimization) {
      const result = await this.optimizationService.optimize(
        strategy,
        historicalData,
      );

      if (result && Object.keys(result.parameters).length > 0) {
        await this.applyNewParameters(
          strategy,
          result.parameters,
          `Optimization triggered by ${currentRegime} regime`,
        );
      }
    }
  }

  private async applyNewParameters(
    strategy: Strategy,
    newParams: Record<string, number>,
    reason: string,
  ) {
    this.logger.log(
      `Applying new parameters for ${strategy.name}: ${JSON.stringify(newParams)}`,
    );

    // 1. Save new version
    const latestVersion = strategy.versions.sort(
      (a, b) => b.version - a.version,
    )[0];
    const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1;

    const version = this.versionRepo.create({
      strategy,
      version: newVersionNumber,
      parameters: newParams,
      reason,
    });
    await this.versionRepo.save(version);

    // 2. Update current parameters (In-memory update for live trading would happen here)
    // For now, we update the entity definitions
    for (const param of strategy.parameters) {
      if (newParams[param.key] !== undefined) {
        param.value = newParams[param.key];
      }
    }
    await this.strategyRepo.save(strategy);

    this.logger.log(
      `Strategy ${strategy.name} updated to version ${newVersionNumber}`,
    );
  }
}
