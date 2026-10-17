import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Otp } from '../otp/otp.entity';
import { PasswordResetToken } from '../auth/password-reset.entity';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { WalletsModule } from '../wallet/wallets.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    // Provides the default ioredis connection ScheduledJobsService injects (issue #1409).
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single' as const,
        options: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          retryStrategy: (times: number) => (times >= 10 ? null : Math.min(times * 1000, 30_000)),
        },
      }),
    }),
    TypeOrmModule.forFeature([Transaction, Otp, PasswordResetToken]),
    WalletsModule,
    AuditModule,
  ],
  providers: [ScheduledJobsService],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
