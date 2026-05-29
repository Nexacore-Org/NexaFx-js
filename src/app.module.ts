import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { Configuration } from './config/configuration';

const enableBull =
  process.env.NODE_ENV !== 'test' && process.env.DISABLE_BULL !== 'true';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<Configuration>) => {
        const config =
          configService.get<Configuration['database']>('database')!;
        return {
          type: 'postgres' as const,
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          database: config.database,
          synchronize: process.env.NODE_ENV !== 'production',
          logging: process.env.NODE_ENV === 'development',
          autoLoadEntities: true,
        };
      },
      inject: [ConfigService],
    }),
    ...(enableBull
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService<Configuration>) => {
              const config =
                configService.get<Configuration['redis']>('redis')!;
              return {
                redis: {
                  host: config.host,
                  port: config.port,
                  enableReadyCheck: false,
                  lazyConnect: true,
                },
                defaultJobOptions: {
                  removeOnComplete: true,
                  removeOnFail: true,
                },
              };
            },
            inject: [ConfigService],
          }),
        ]
      : []),
    IdempotencyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
