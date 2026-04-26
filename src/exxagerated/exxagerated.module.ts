import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InsightsController } from './controllers/insights.controller';
import { AnalyticsAdminController } from './controllers/analytics-admin.controller';

import { InsightsService } from './insights.service';
import { AggregationService } from './services/aggregation.service';
import { DataRetentionService } from './services/data-retention.service';
import { AnonymizationValidatorService } from './services/anonymization-validator.service';

import { DataLineage } from './entities/data-lineage.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DataLineage]),
  ],
  controllers: [
    InsightsController,           // ✅ NEW
    AnalyticsAdminController,     // ✅ NEW
  ],
  providers: [
    InsightsService,
    AggregationService,
    DataRetentionService,
    AnonymizationValidatorService,
  ],
  exports: [
    InsightsService,
    AggregationService,
  ],
})
export class ExxaModule {}