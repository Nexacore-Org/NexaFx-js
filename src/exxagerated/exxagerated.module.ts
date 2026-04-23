import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsightsController } from './exxagerated.controller';
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
  controllers: [InsightsController],
  providers: [
    InsightsService,
    AggregationService,
    DataRetentionService,
    AnonymizationValidatorService,
  ],
  exports: [InsightsService, AggregationService],
})
export class ExxaModule {}