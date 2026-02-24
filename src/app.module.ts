import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { RetryModule } from './modules/retry/retry.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { HealthModule } from './modules/health/health.module';
import { RpcHealthModule } from './modules/rpc-health/rpc-health.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { UsersModule } from './modules/users/users.module';
import { FeesModule } from './modules/fee/fee.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { SecretsModule } from './modules/secrets/secrets.module';
import { AdminModule } from './modules/admin/admin.module';
import { DataArchiveModule } from './modules/data-archive/data-archive.module';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: process.env.NODE_ENV === 'development',
    }),
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        autoLoadEntities: true,
        synchronize: !configService.get('app.isProduction'),
        logging: configService.get('app.isDevelopment'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
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
    ReconciliationModule,
    FeesModule,
    SecretsModule,
    AdminModule,
    DataArchiveModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
