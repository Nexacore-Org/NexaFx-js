import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ApiUsageLoggingMiddleware } from './middleware/api-usage-logging.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiUsageLogEntity } from './entities/api-usage-log.entity';
import { ApiUsageService } from './services/api-usage.service';
import { RevenueAnalyticsService } from './services/revenue-analytics.service';
import { RevenueAnalyticsController } from './controllers/revenue-analytics.controller';
import { AnalyticsAdminController } from './controllers/analytics-admin.controller';
import { AnalyticsCleanupWorker } from './workers/analytics-cleanup.worker';
import { NotificationDeliveryAnalyticsController } from './controllers/notification-delivery-analytics.controller';
import { NotificationDeliveryReceiptEntity } from '../notifications/entities/notification-delivery-receipt.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiUsageLogEntity, NotificationDeliveryReceiptEntity]),
    ScheduleModule.forRoot(),
  ],
  providers: [ApiUsageService, AnalyticsCleanupWorker, RevenueAnalyticsService],
  controllers: [
    AnalyticsAdminController,
    RevenueAnalyticsController,
    NotificationDeliveryAnalyticsController,
  ],
  exports: [ApiUsageService, RevenueAnalyticsService],
})
export class AnalyticsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiUsageLoggingMiddleware).forRoutes('*');
  }
}
