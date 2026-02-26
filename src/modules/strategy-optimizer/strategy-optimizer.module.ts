import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Strategy } from './entities/strategy.entity';
import { StrategyParameter } from './entities/strategy-parameter.entity';
import { StrategyVersion } from './entities/strategy-version.entity';
import { PerformanceMetric } from './entities/performance-metric.entity';
import { OptimizationService } from './services/optimization.service';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { RegimeDetectionService } from './services/regime-detection.service';
import { StrategyManagerService } from './services/strategy-manager.service';
import { StrategyAdminController } from './controllers/strategy-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Strategy,
      StrategyParameter,
      StrategyVersion,
      PerformanceMetric,
    ]),
  ],
  controllers: [StrategyAdminController],
  providers: [
    OptimizationService,
    MetricsCollectorService,
    RegimeDetectionService,
    StrategyManagerService,
  ],
  exports: [StrategyManagerService],
})
export class StrategyOptimizerModule {}
