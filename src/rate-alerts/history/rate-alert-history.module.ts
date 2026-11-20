import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateAlertHistory } from './rate-alert-history.entity';
import { RateAlertHistoryService } from './rate-alert-history.service';
import { RateAlertHistoryController } from './rate-alert-history.controller';
import { RateAlertHistoryListener } from './rate-alert-history.listener';

@Module({
  imports: [TypeOrmModule.forFeature([RateAlertHistory])],
  controllers: [RateAlertHistoryController],
  providers: [RateAlertHistoryService, RateAlertHistoryListener],
  exports: [RateAlertHistoryService],
})
export class RateAlertHistoryModule {}
