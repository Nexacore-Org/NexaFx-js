import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { InsightsController } from './controllers/insights.controller';
import { AnalyticsAdminController } from './controllers/analytics-admin.controller';

import { InsightsService } from './insights.service';
import { AggregationService } from './services/aggregation.service';
import { DataRetentionService } from './services/data-retention.service';
import { AnonymizationValidatorService } from './services/anonymization-validator.service';

import { DataLineage } from './entities/data-lineage.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([DataLineage]),
  ],
  controllers: [
    InsightsController,
    AnalyticsAdminController,
  ],
  providers: [
    InsightsService,
    AggregationService,
    DataRetentionService,
    AnonymizationValidatorService,
  ],
  exports: [InsightsService, AggregationService],
})
export class ExxaModule {}