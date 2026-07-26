import { Module } from '@nestjs/common';
import { RateAlertsService } from './rate-alerts.service';

@Module({
  providers: [RateAlertsService],
  exports: [RateAlertsService],
})
export class RateAlertsModule {}
