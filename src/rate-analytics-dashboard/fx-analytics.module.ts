import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { RateSnapshot } from './entities/rate-snapshot.entity';
import { ProviderHealthMetric } from './entities/provider-health-metric.entity';
import { FxAnalyticsService } from './services/fx-analytics.service';
import { FxController } from './controllers/fx.controller';
import { FxAdminController } from './controllers/fx-admin.controller';
import {
  RateSnapshotProcessor,
  RateSnapshotScheduler,
  RATE_SNAPSHOT_QUEUE,
} from './rate-snapshot.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateSnapshot, ProviderHealthMetric]),
    BullModule.registerQueue({
      name: RATE_SNAPSHOT_QUEUE,
    }),
  ],
  providers: [
    FxAnalyticsService,
    RateSnapshotProcessor,
    RateSnapshotScheduler,
  ],
  controllers: [FxController, FxAdminController],
  exports: [FxAnalyticsService],
})
export class FxAnalyticsModule {}
