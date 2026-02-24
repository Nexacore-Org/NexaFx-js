import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RateLimitRuleEntity } from './entities/rate-limit-rule.entity';
import { RateLimitTrackerEntity } from './entities/rate-limit-tracker.entity';
import { RateLimitViolationLogEntity } from './entities/rate-limit-violation-log.entity';
import { RateLimitService } from './services/rate-limit.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitAdminController } from './controllers/rate-limit-admin.controller';
import { RateLimitCleanupWorker } from './workers/rate-limit-cleanup.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RateLimitRuleEntity,
      RateLimitTrackerEntity,
      RateLimitViolationLogEntity,
    ]),
    ScheduleModule.forRoot(),
  ],
  providers: [RateLimitService, RateLimitGuard, RateLimitCleanupWorker],
  controllers: [RateLimitAdminController],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
