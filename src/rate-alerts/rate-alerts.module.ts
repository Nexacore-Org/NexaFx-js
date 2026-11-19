import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrenciesModule } from '../currencies/currencies.module';
import { RateAlertEntity } from './rate-alert.entity';
import { RateAlertsService } from './rate-alerts.service';
import { RateAlertsController } from './rate-alerts.controller';
import { RateAlertHistoryModule } from './history/rate-alert-history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateAlertEntity]),
    CurrenciesModule,
    RateAlertHistoryModule,
  ],
  controllers: [RateAlertsController],
  providers: [RateAlertsService],
  exports: [RateAlertsService],
})
export class RateAlertsModule {}
