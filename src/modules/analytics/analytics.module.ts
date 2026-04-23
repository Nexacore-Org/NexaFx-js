import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ApiUsageLoggingMiddleware } from './middleware/api-usage-logging.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiUsageLogEntity } from './entities/api-usage-log.entity';
import { ApiUsageService } from './services/api-usage.service';
import { RevenueAnalyticsService } from './services/revenue-analytics.service';
import { RevenueAnalyticsController } from './controllers/revenue-analytics.controller';
import { AnalyticsAdminController } from './controllers/admin-analytics.controller';
import { AnalyticsCleanupWorker } from './workers/analytics-cleanup.worker';
import { NotificationDeliveryAnalyticsController } from './controllers/notification-delivery-analytics.controller';
import { NotificationDeliveryReceiptEntity } from '../notifications/entities/notification-delivery-receipt.entity';
import { TransactionAnalyticsService } from './services/transaction-analytics.service';
import { FraudAnalyticsService } from './services/fraud-analytics.service';
import { AnalyticsController } from './controllers/analytics.controller';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionRiskEntity } from '../transactions/entities/transaction-risk.entity';
import { TransactionCategoryEntity } from '../transactions/entities/transaction-category.entity';
import { FeeRuleEntity } from '../fee/entities/fee-rule.entity';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiUsageLogEntity,
      NotificationDeliveryReceiptEntity,
      TransactionEntity,
      TransactionRiskEntity,
      TransactionCategoryEntity,
      FeeRuleEntity,
    ]),
    ScheduleModule.forRoot(),
    TenantsModule,
  ],
  providers: [
    ApiUsageService,
    AnalyticsCleanupWorker,
    RevenueAnalyticsService,
    TransactionAnalyticsService,
    FraudAnalyticsService,
  ],
  controllers: [
    AnalyticsController,
    AnalyticsAdminController,
    RevenueAnalyticsController,
    NotificationDeliveryAnalyticsController,
  ],
  exports: [
    ApiUsageService,
    RevenueAnalyticsService,
    TransactionAnalyticsService,
    FraudAnalyticsService,
  ],
})
export class AnalyticsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiUsageLoggingMiddleware).forRoutes('*');
  }
}
