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
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { StrategyOptimizerModule } from './modules/strategy-optimizer/strategy-optimizer.module';
import { RiskEngineModule } from './modules/risk-engine/risk-engine.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
// NOTE: './modules/users/users.module' does not exist; the only UsersModule is at './users/users.module'.
// Aliased as UpstreamUsersModule below (line 84).
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
import { AccountFreezeModule } from './modules/account-freeze/account-freeze.module';
import { StellarFederationModule } from './modules/stellar-federation/stellar-federation.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ExportModule } from './modules/export/export.module';
import { InsightsForecastModule } from './modules/insights/insights-forecast.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { KycModule } from './modules/kyc/kyc.module';
import { WalletsModule as ModulesWalletsModule } from './modules/wallets/wallets.module';
import { ScheduledTransactionsModule } from './modules/scheduled-transactions/scheduled-transactions.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { CardsModule } from './modules/cards/cards.module';
import { FxModule } from './modules/fx/fx.module';
import { BankingModule } from './banking/banking.module';
import { LoyaltyModule } from './loyalty-point/loyalty.module';
import { DisputesModule as ModulesDisputesModule } from './modules/disputes/disputes.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { CacheModule as ModulesCacheModule } from './modules/cache/cache.module';
import { MailModule } from './modules/mail/mail.module';
import { TransactionApprovalModule } from './multi-signature-approval/transaction-approval.module';
import { SpendingModule } from './spending/spending.module';
import { FeeTiersModule } from './fee-tiers/fee-tiers.module';
import { AuditModule } from './audit/audit.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ConfigModule } from './config/config.module';
import { Configuration } from './config/configuration';
import { CurrenciesModule } from './currencies/currencies.module';
import { HealthModule } from './health/health.module';
import { MailModule as UpstreamMailModule, MailQueueModule } from './mail/mail.module';
import { NotificationQueueModule } from './notification/notification.module';
import { TermsModule } from './terms/terms.module';
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
import { ReferralModule } from './referral/referral.module';
import { AmlModule } from './aml/aml.module';
import { EscrowModule } from './modules/escrow/escrow.module';
import { SplitPaymentsModule } from './modules/split-payments/split-payments.module';
import { SupportTicketsModule } from './modules/support-tickets/support-tickets.module';
import { FeeReportsModule } from './modules/fee-reports/fee-reports.module';
import { WalletHistoryModule } from './modules/wallet-history/wallet-history.module';
import { KycTiersModule } from './modules/kyc-tiers/kyc-tiers.module';
import { AppGraphQLModule } from './graphql/graphql.module';

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
        ]
      : []),
    HealthModule,
    UpstreamUsersModule,
    AuditModule,
    MailModule,
    UpstreamMailModule,
    TransactionApprovalModule,
    SpendingModule,
    FeeTiersModule,
    WalletsModule,
    ScheduledTransactionsModule,
    ExchangeRatesModule,
    BulkPaymentsModule,
    DisputesModule,
    CurrenciesModule,
    TermsModule,
    AuthModule,
    RateAlertHistoryModule,
    ScheduledReportsModule,
    PortfolioModule,
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
    ReferralModule,
    AmlModule,
    ModulesWalletsModule,
    ModulesCacheModule,
    AdminModule,
    FeatureFlagsModule,
    RateLimitModule,
    AdminAuditModule,
    StrategyOptimizerModule,
    RiskEngineModule,
    SessionsModule,
    TransactionsModule,
    EnrichmentModule,
    NotificationsModule,
    WebSocketNotificationsModule,
    InsightsForecastModule,
    ReferralsModule,
    KycModule,
    EscrowModule,
    SplitPaymentsModule,
    SupportTicketsModule,
    FeeReportsModule,
    WalletHistoryModule,
    KycTiersModule,
    AppGraphQLModule,
    FxModule,
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
  configure(_consumer: MiddlewareConsumer) {
    // Reserved for future middleware wiring.
    void RequestMethod.ALL;
  }
}
