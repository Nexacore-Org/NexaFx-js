import { BullModule } from '@nestjs/bull';
import { CacheModule } from '@nestjs/cache-manager';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { redisStore } from 'cache-manager-redis-store';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
// NOTE: './modules/users/users.module' does not exist; the only UsersModule is at
// './users/users.module', imported below as UpstreamUsersModule.
// NOTE: every relative import below must resolve to a file on disk — `npm run
// check:app-module-imports` enforces this in CI. Modules that were imported here but never
// committed are listed under "Deferred modules" in docs/architecture.md.
import { SessionsModule } from './modules/sessions/sessions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { FeesModule } from './modules/fee/fee.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { LedgerModule } from './ledger/ledger.module';
import { AccountFreezeModule } from './modules/account-freeze/account-freeze.module';
import { StellarFederationModule } from './modules/stellar-federation/stellar-federation.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ExportModule } from './modules/export/export.module';
import { KycModule } from './kyc/kyc.module';
import { FxModule } from './fx/fx.module';
import { DisputesModule as ModulesDisputesModule } from './disputes/disputes.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { SpendingModule } from './spending/spending.module';
import { FeeTiersModule } from './fee-tiers/fee-tiers.module';
import { AuditModule } from './audit/audit.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ConfigModule } from './config/config.module';
import { Configuration } from './config/configuration';
import { CurrenciesModule } from './currencies/currencies.module';
import { HealthModule } from './health/health.module';
import {
  MailModule as UpstreamMailModule,
  MailQueueModule,
} from './mail/mail.module';
import { NotificationQueueModule } from './notification/notification.module';
import { TermsModule } from './terms/terms.module';
import { StatementsModule } from './statements/statements.module';
import { TransactionQueueModule } from './transaction/transaction.module';
import { RateAlertHistoryModule } from './rate-alerts/history/rate-alert-history.module';
import { ScheduledReportsModule } from './scheduled-reports/scheduled-reports.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { UsersModule as UpstreamUsersModule } from './users/users.module';
import { WalletsModule } from './wallet/wallets.module';
import { ReconciliationModule as UpstreamReconciliationModule } from './reconciliation/reconciliation.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { BulkPaymentsModule } from './bulk-payments/bulk-payments.module';
import { ScheduledJobsModule } from './scheduled-jobs/scheduled-jobs.module';
import { DisputesModule } from './disputes/disputes.module';
import { MetricsModule } from './metrics/metrics.module';
import { RatesModule } from './rates/rates.module';
import { StellarModule } from './stellar/stellar.module';
import { EndpointRateLimitModule } from './modules/endpoint-rate-limit/endpoint-rate-limit.module';
import { UserDeactivationModule } from './modules/user-deactivation/user-deactivation.module';
import { FeeAuditModule } from './modules/fee-audit/fee-audit.module';
import { ActivityFeedModule } from './activity-feed/activity-feed.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import { NotificationsModule as ConsolidatedNotificationsModule } from './notifications/notifications.module';
import { ReferralModule } from './referral/referral.module';
import { FeeRevenueModule } from './reports/fee-revenue.module';
import { AmlModule } from './aml/aml.module';
import { SupportTicketsModule } from './modules/support-tickets/support-tickets.module';
import { FeeReportsModule } from './modules/fee-reports/fee-reports.module';
import { WalletHistoryModule } from './modules/wallet-history/wallet-history.module';
import { KycTiersModule } from './modules/kyc-tiers/kyc-tiers.module';
import { AppGraphQLModule } from './graphql/graphql.module';
import { QueuesModule } from './queues/queues.module';

const enableBull =
  process.env.NODE_ENV !== 'test' && process.env.DISABLE_BULL !== 'true';

async function createCacheOptions(configService: ConfigService<Configuration>) {
  const redis = configService.get<Configuration['redis']>('redis');
  const cache = configService.get<Configuration['cache']>('cache');

  if (!redis || !cache) {
    return { ttl: 60 };
  }

  try {
    return {
      store: await redisStore({
        socket: {
          host: redis.host,
          port: redis.port,
          reconnectStrategy: (retries: number) => {
            if (retries >= 10) {
              return false;
            }
            return Math.min(1000 * 2 ** retries, 30_000);
          },
        },
        password: redis.password,
        ttl: cache.defaultTtlSeconds,
      }),
    };
  } catch {
    return {
      ttl: cache.defaultTtlSeconds,
    };
  }
}

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createCacheOptions,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Configuration>) => {
        const database =
          configService.get<Configuration['database']>('database');

        if (process.env.NODE_ENV === 'test') {
          return {
            type: 'better-sqlite3' as const,
            database: ':memory:',
            autoLoadEntities: true,
            synchronize: true,
            dropSchema: true,
          };
        }

        return {
          type: 'postgres' as const,
          host: database?.host,
          port: database?.port,
          username: database?.username,
          password: database?.password,
          database: database?.database,
          ssl: database?.ssl,
          autoLoadEntities: true,
          synchronize: false,
          retryAttempts: 10,
          retryDelay: 3000,
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration>) => {
        const rateLimit = config.get<Configuration['rateLimit']>('rateLimit');
        return {
          throttlers: [
            {
              ttl: rateLimit?.windowMs ?? 60000,
              limit: rateLimit?.maxRequests ?? 100,
            },
          ],
        };
      },
    }),
    EventEmitterModule.forRoot({ global: true }),
    ScheduleModule.forRoot(),
    ...(enableBull
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService<Configuration>) => {
              const redis = configService.get<Configuration['redis']>('redis');

              return {
                redis: {
                  host: redis?.host ?? 'localhost',
                  port: redis?.port ?? 6379,
                  password: redis?.password,
                  enableReadyCheck: false,
                  lazyConnect: true,
                  maxRetriesPerRequest: null,
                  retryStrategy: (attempts: number) => {
                    if (attempts >= 10) {
                      return null;
                    }
                    return Math.min(1000 * 2 ** attempts, 30_000);
                  },
                },
                defaultJobOptions: {
                  attempts: 3,
                  backoff: {
                    type: 'exponential',
                    delay: 2000,
                  },
                  removeOnComplete: true,
                  removeOnFail: true,
                },
              };
            },
          }),
          BullModule.registerQueue({ name: 'default' }),
          MailQueueModule,
          NotificationQueueModule,
          TransactionQueueModule,
          QueuesModule,
        ]
      : []),
    HealthModule,
    UpstreamUsersModule,
    AuditModule,
    UpstreamMailModule,
    SpendingModule,
    FeeTiersModule,
    WalletsModule,
    ExchangeRatesModule,
    BulkPaymentsModule,
    DisputesModule,
    CurrenciesModule,
    TermsModule,
    StatementsModule,
    AuthModule,
    RateAlertHistoryModule,
    ScheduledReportsModule,
    PortfolioModule,
    FeesModule,
    WebhooksModule,
    IdempotencyModule,
    LedgerModule,
    AccountFreezeModule,
    StellarFederationModule,
    ApiKeysModule,
    ExportModule,
    UpstreamReconciliationModule,
    ScheduledJobsModule,
    ModulesDisputesModule,
    MetricsModule,
    StellarModule,
    RatesModule,
    EndpointRateLimitModule,
    UserDeactivationModule,
    FeeAuditModule,
    ActivityFeedModule,
    NotificationPreferencesModule,
    ConsolidatedNotificationsModule,
    ReferralModule,
    FeeRevenueModule,
    AmlModule,
    AdminModule,
    RateLimitModule,
    SessionsModule,
    TransactionsModule,
    KycModule,
    SupportTicketsModule,
    FeeReportsModule,
    WalletHistoryModule,
    KycTiersModule,
    AppGraphQLModule,
    FxModule,
    BlockchainModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Reserved for future middleware wiring.
    void consumer;
    void RequestMethod.ALL;
  }
}
