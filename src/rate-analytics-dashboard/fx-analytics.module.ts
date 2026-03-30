import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import { RateSnapshot } from './entities/rate-snapshot.entity';
import { ProviderHealthMetric } from './entities/provider-health-metric.entity';
import { FxAnalyticsService, FX_AGGREGATOR_SERVICE } from './services/fx-analytics.service';
import { FxController } from './controllers/fx.controller';
import { FxAdminController } from './controllers/fx-admin.controller';
import {
  RateSnapshotProcessor,
  RateSnapshotScheduler,
  RATE_SNAPSHOT_QUEUE,
} from './jobs/rate-snapshot.job';

/**
 * FxAnalyticsModule
 *
 * Wire-in instructions for the host AppModule:
 *
 *   1. Import this module.
 *   2. Ensure BullModule.forRoot(...) and TypeOrmModule.forRoot(...) are
 *      registered at the app level.
 *   3. Provide your FxAggregatorService under the FX_AGGREGATOR_SERVICE token:
 *
 *        {
 *          provide: FX_AGGREGATOR_SERVICE,
 *          useExisting: FxAggregatorService,
 *        }
 *
 *   4. Run the TypeORM migration to create rate_snapshots and
 *      provider_health_metrics tables (see migration template below).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RateSnapshot, ProviderHealthMetric]),

    BullModule.registerQueue({
      name: RATE_SNAPSHOT_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: { count: 48 },
        removeOnFail: { count: 24 },
      },
    }),

    // Required for @Cron decorators if used elsewhere in the app
    ScheduleModule.forRoot(),
  ],

  providers: [
    FxAnalyticsService,
    RateSnapshotProcessor,
    RateSnapshotScheduler,

    // ── Re-export the aggregator under its injection token ──────────────────
    // The host module must provide a value for FX_AGGREGATOR_SERVICE.
    // Uncomment and adjust once the token is known:
    //
    // {
    //   provide: FX_AGGREGATOR_SERVICE,
    //   useExisting: FxAggregatorService,
    // },
  ],

  controllers: [FxController, FxAdminController],

  exports: [FxAnalyticsService],
})
export class FxAnalyticsModule {}
