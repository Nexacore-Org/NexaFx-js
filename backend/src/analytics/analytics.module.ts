import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { ReportGenerationService } from './services/report-generation.service';
import { ReportProcessor } from './processors/report.processor';
import { Report } from './entities/report.entity';
// Assume a 'Transaction' entity exists and is exported from its module
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, Transaction]),
    BullModule.registerQueue({
        name: 'reports',
    }),
    CacheModule.register({
        store: redisStore,
        host: 'localhost',
        port: 6379,
    }),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    ReportGenerationService,
    ReportProcessor,
  ],
})
export class AnalyticsModule {}