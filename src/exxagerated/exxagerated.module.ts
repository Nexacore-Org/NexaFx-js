import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { AggregationService } from './services/aggregation.service';
import { DataRetentionService } from './services/data-retention.service';
import { AnonymizationService } from './services/anonymization.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InsightsController],
  providers: [
    InsightsService,
    AggregationService,
    DataRetentionService,
    AnonymizationService,
  ],
  exports: [InsightsService],
})
export class InsightsModule {}