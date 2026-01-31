import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { RetryModule } from './modules/retry/retry.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';  
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { ApiUsageLogEntity } from './modules/analytics/entities/api-usage-log.entity';
import { WalletAliasEntity } from './modules/transactions/entities/wallet-alias.entity';
import { HealthModule } from './modules/health/health.module';
import { RpcHealthModule } from './modules/rpc-health/rpc-health.module';
import { RpcHealthLogEntity } from './modules/rpc-health/entities/rpc-health-log.entity';
import { FeatureFlagEntity } from './modules/feature-flags/entities/feature-flag.entity';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { RateLimitRuleEntity } from './modules/rate-limit/entities/rate-limit-rule.entity';
import { RateLimitTrackerEntity } from './modules/rate-limit/entities/rate-limit-tracker.entity';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminAuditLogEntity } from './modules/admin-audit/entities/admin-audit-log.entity';
import { UsersModule } from './modules/users/users.module';
import { UserPreferenceEntity } from './modules/users/entities/user-preference.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'nexafx_dev',
      entities: [
        ApiUsageLogEntity,
        RpcHealthLogEntity,
        RateLimitRuleEntity,
        RateLimitTrackerEntity,
        FeatureFlagEntity,
        AdminAuditLogEntity,
        UserPreferenceEntity,
        WalletAliasEntity,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    AnalyticsModule,
    HealthModule,
    RpcHealthModule,
    FeatureFlagsModule,
    RateLimitModule,
    AdminAuditModule,
    UsersModule,
      NotificationsModule,
    WebhooksModule,
    RetryModule,
    SessionsModule,
    TransactionsModule,
    EnrichmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
