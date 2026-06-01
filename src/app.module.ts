import { BullModule } from '@nestjs/bull';
import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
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
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ConfigModule } from './config/config.module';
import { Configuration } from './config/configuration';
import { CurrenciesModule } from './currencies/currencies.module';
import { HealthModule } from './health/health.module';
import { MailModule, MailQueueModule } from './mail/mail.module';
import { NotificationQueueModule } from './notification/notification.module';
import { TermsModule } from './terms/terms.module';
import { TransactionQueueModule } from './transaction/transaction.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallet/wallets.module';

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
        const database = configService.get<Configuration['database']>('database');

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
    UsersModule,
    AuditModule,
    MailModule,
    WalletsModule,
    CurrenciesModule,
    TermsModule,
    AuthModule,
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
