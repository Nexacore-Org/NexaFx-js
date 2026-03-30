import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { RateLimitRuleEntity } from './entities/rate-limit-rule.entity';
import { RateLimitTrackerEntity } from './entities/rate-limit-tracker.entity';
import { RateLimitViolationLogEntity } from './entities/rate-limit-violation-log.entity';
import { RateLimitService } from './services/rate-limit.service';
import { RedisRateLimitService } from './services/redis-rate-limit.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitAdminController } from './controllers/rate-limit-admin.controller';
import { RateLimitCleanupWorker } from './workers/rate-limit-cleanup.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateLimitRuleEntity, RateLimitTrackerEntity, RateLimitViolationLogEntity]),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  providers: [RateLimitService, RedisRateLimitService, RateLimitGuard, RateLimitCleanupWorker],
  controllers: [RateLimitAdminController],
  exports: [RateLimitService, RedisRateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
