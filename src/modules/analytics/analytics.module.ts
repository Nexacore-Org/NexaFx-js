import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ApiUsageLoggingMiddleware } from './middleware/api-usage-logging.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiUsageLogEntity } from './entities/api-usage-log.entity';
import { ApiUsageService } from './services/api-usage.service';
import { AnalyticsAdminController } from './controllers/analytics-admin.controller';
import { AnalyticsCleanupWorker } from './workers/analytics-cleanup.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiUsageLogEntity]),
    ScheduleModule.forRoot(),
  ],
  providers: [ApiUsageService, AnalyticsCleanupWorker],
  controllers: [AnalyticsAdminController],
  exports: [ApiUsageService],
})
export class AnalyticsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiUsageLoggingMiddleware).forRoutes('*');
  }
}
