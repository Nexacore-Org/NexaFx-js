import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RateLimitRuleEntity } from './entities/rate-limit-rule.entity';
import { RateLimitTrackerEntity } from './entities/rate-limit-tracker.entity';
import { RateLimitViolationLogEntity } from './entities/rate-limit-violation-log.entity';
import { RateLimitRecordEntity } from './entities/rate-limit-record.entity';
import { RateLimitService } from './services/rate-limit.service';
import { PerUserRateLimitService } from './services/per-user-rate-limit.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { PerUserRateLimitGuard } from './guards/per-user-rate-limit.guard';
import { RateLimitAdminController } from './controllers/rate-limit-admin.controller';
import { RateLimitUsageController } from './controllers/rate-limit-usage.controller';
import { RateLimitCleanupWorker } from './workers/rate-limit-cleanup.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RateLimitRuleEntity,
      RateLimitTrackerEntity,
      RateLimitViolationLogEntity,
      RateLimitRecordEntity,
    ]),
    ScheduleModule.forRoot(),
  ],
  providers: [
    RateLimitService,
    PerUserRateLimitService,
    RateLimitGuard,
    PerUserRateLimitGuard,
    RateLimitCleanupWorker,
  ],
  controllers: [RateLimitAdminController, RateLimitUsageController],
  exports: [RateLimitService, PerUserRateLimitService, RateLimitGuard, PerUserRateLimitGuard],
})
export class RateLimitModule {}
