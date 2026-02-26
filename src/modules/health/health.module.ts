import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { ConfigHealthIndicator } from './indicators/config.indicator';

@Module({
  imports: [TerminusModule, ConfigModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, ConfigHealthIndicator, ConfigService],
})
export class HealthModule {}
