import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { ConfigHealthIndicator } from './indicators/config.indicator';
import { SystemMetricsService } from './services/system-metrics.service';
import { AdminMetricsController } from './controllers/admin-metrics.controller';
import { MetricsAlertJob } from './jobs/metrics-alert.job';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

@Module({
  imports: [TerminusModule, ConfigModule, ScheduleModule.forRoot(), RateLimitModule],
  controllers: [HealthController, AdminMetricsController],
  providers: [
    DatabaseHealthIndicator,
    ConfigHealthIndicator,
    ConfigService,
    SystemMetricsService,
    MetricsAlertJob,
  ],
  exports: [SystemMetricsService],
})
export class HealthModule {}
