import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { redisStore } from 'cache-manager-redis-store';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './config/configuration';
import { TypeOrmSlowQueryLogger } from './database/typeorm-slow-query.logger';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { MailModule, MailQueueModule } from './mail/mail.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { NotificationQueueModule } from './notification/notification.module';
import { TransactionQueueModule } from './transaction/transaction.module';
import { AccountClosureModule } from './users/account-closure.module';
import { OtpModule } from './otp/otp.module';
import { AmlModule } from './aml/aml.module';
import { ArchivalModule } from './archival/archival.module';
import { FxModule } from './fx/fx.module';
import { PushModule } from './notifications/push/push.module';
import { ReferralModule } from './referral/referral.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AuditModule } from './audit/audit.module';
import { KycModule } from './kyc/kyc.module';
import { WalletsModule } from './wallet/wallets.module';
import { TermsModule } from './terms/terms.module';
import { StatementsModule } from './statements/statements.module';
import { SupportTicketsModule } from './support/support-tickets.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { AdminModule } from './admin/admin.module';
import { SecurityModule } from './common/security.module';
import { GeoRestrictionMiddleware } from './common/middleware/geo-restriction.middleware';

const enableBull =
  process.env.NODE_ENV !== 'test' && process.env.DISABLE_BULL !== 'true';

@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<Configuration>) => {
        const redis = configService.get<Configuration['redis']>('redis')!;
        const cache = configService.get<Configuration['cache']>('cache')!;
        return {
          store: await redisStore({
            host: redis.host,
            port: redis.port,
            password: redis.password,
            ttl: cache.defaultTtlSeconds,
          }),
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'nexafx_dev',
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
        autoLoadEntities: true,
        // Retry settings to handle DB startup race conditions (Docker Compose)
        retryAttempts: 10,
        retryDelay: 3000,
      }),
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Configuration>) => {
        const database =
          configService.get<Configuration['database']>('database')!;
        const slowQueryThresholdMs =
          configService.get<number>('slowQueryThresholdMs') ?? 1000;
        return {
          type: 'postgres' as const,
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.database,
          synchronize: process.env.NODE_ENV !== 'production',
          logging: process.env.NODE_ENV === 'development',
          autoLoadEntities: true,
          retryAttempts: 10,
          retryDelay: 3000,
          maxQueryExecutionTime: slowQueryThresholdMs,
          logger: new TypeOrmSlowQueryLogger(slowQueryThresholdMs),
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('rateLimit.windowMs')!,
            limit: config.get<number>('rateLimit.maxRequests')!,
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    ...(enableBull
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService<Configuration>) => {
              const redis = configService.get<Configuration['redis']>('redis')!;
              return {
                redis: {
                  host: redis.host,
                  port: redis.port,
                  enableReadyCheck: false,
                  lazyConnect: true,
                },
                defaultJobOptions: {
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
    IdempotencyModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
    AccountClosureModule,
    AuthModule,
    EventEmitterModule.forRoot({ global: true }),
    OtpModule,
    AmlModule,
    ArchivalModule,
    FxModule,
    PushModule,
    ReferralModule,
    WalletsModule,
    UsersModule,
    TransactionsModule,
    AuditModule,
    KycModule,
    MailModule,
    TransactionApprovalModule,
  EventEmitterModule.forRoot(),
    DocumentsModule,
    TermsModule,
    StatementsModule,
    SupportTicketsModule,
    WebhooksModule,
    CurrenciesModule,
    AdminModule,
    SecurityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  providers: [AppService, GeoRestrictionMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(GeoRestrictionMiddleware)
      .forRoutes(
        { path: 'api/v1/auth/login', method: RequestMethod.POST },
        { path: 'api/v1/auth/register', method: RequestMethod.POST },
      );
  }
}
