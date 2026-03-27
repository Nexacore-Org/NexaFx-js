import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from './config/config.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { RpcHealthModule } from './modules/rpc-health/rpc-health.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { StrategyOptimizerModule } from './modules/strategy-optimizer/strategy-optimizer.module';
import { RiskEngineModule } from './modules/risk-engine/risk-engine.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { NotificationsModule as WebSocketNotificationsModule } from './web-sockets/notifications.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { RetryModule } from './modules/retry/retry.module';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { FeesModule } from './modules/fee/fee.module';
import { TransactionRiskModule } from './modules/transaction-risk/transaction-risk.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SecretsModule } from './modules/secrets/secrets.module';
import { DataArchiveModule } from './modules/data-archive/data-archive.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { GoalsModule } from './goals/goal.module';
import { AnnouncementsModule } from './announcement/announcement.module';
import { ComplianceModule } from './compliance-evidence/compliance.module';
import { LedgerModule } from './double-entry-ledger/ledger.module';
import { VersioningModule } from './versioning/versioning.module';
import { InsightsModule } from './exxagerated/exxagerated.module';
import { ReferralsModule } from './modules/referrals/referrals.module';

const enableBull =
  process.env.NODE_ENV !== 'test' && process.env.DISABLE_BULL !== 'true';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'nexafx_dev',
        synchronize: process.env.NODE_ENV !== 'production',
        logging: process.env.NODE_ENV === 'development',
        autoLoadEntities: true,
      }),
    }),
    ...(enableBull
      ? [
          BullModule.forRoot({
            redis: {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              enableReadyCheck: false,
              lazyConnect: true,
            },
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: true,
            },
          }),
        ]
      : []),
    AnalyticsModule,
    HealthModule,
    RpcHealthModule,
    FeatureFlagsModule,
    RateLimitModule,
    AdminAuditModule,
    StrategyOptimizerModule,
    RiskEngineModule,
    AdminModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    TransactionsModule,
    EnrichmentModule,
    NotificationsModule,
    WebSocketNotificationsModule,
    ReconciliationModule,
    RetryModule,
    ExperimentsModule,
    FeesModule,
    TransactionRiskModule,
    WebhooksModule,
    SecretsModule,
    DataArchiveModule,
    IdempotencyModule,
    GoalsModule,
    AnnouncementsModule,
    ComplianceModule,
    LedgerModule,
    VersioningModule,
    InsightsModule,
    ReferralsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
