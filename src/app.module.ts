import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { MailModule } from './mail/mail.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
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
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
        autoLoadEntities: true,
        // Retry settings to handle DB startup race conditions (Docker Compose)
        retryAttempts: 10,
        retryDelay: 3000,
      }),
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
          BullModule.registerQueue({ name: 'default' }),
        ]
      : []),
    IdempotencyModule,
    AuthModule,
    EventEmitterModule.forRoot(),
    OtpModule,
    AmlModule,
    ArchivalModule,
    FxModule,
    PushModule,
    ReferralModule,
    EventEmitterModule.forRoot(),
    WalletsModule,
    UsersModule,
    TransactionsModule,
    AuditModule,
    KycModule,
    MailModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
