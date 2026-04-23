import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './controllers/health.controller';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { ConfigHealthIndicator } from './indicators/config.indicator';
import { ShutdownService } from './services/shutdown.service';

@Module({
  imports: [TerminusModule, ConfigModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, ConfigHealthIndicator, ConfigService, ShutdownService],
  exports: [ShutdownService],
})
export class HealthModule {}
