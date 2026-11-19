import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlAlert } from './aml-alert.entity';
import { AmlScreening } from './aml-screening.entity';
import { AmlScreeningReview } from './aml-screening-review.entity';
import { AmlService } from './aml.service';
import { AmlScreeningService } from './aml-screening.service';
import { AmlMonitoringListener } from './aml-monitoring.listener';
import { AmlController } from './aml.controller';
import { Transaction } from '../transactions/transaction.entity';
import { AuditModule } from '../audit/audit.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { FileWatchlistProvider } from './watchlist/file-watchlist.provider';
import { WATCHLIST_PROVIDER } from './watchlist/watchlist.types';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AmlAlert,
      AmlScreening,
      AmlScreeningReview,
      Transaction,
    ]),
    AuditModule,
    ExchangeRatesModule,
  ],
  controllers: [AmlController],
  providers: [
    AmlService,
    AmlScreeningService,
    AmlMonitoringListener,
    { provide: WATCHLIST_PROVIDER, useClass: FileWatchlistProvider },
  ],
  exports: [
    AmlService,
    AmlScreeningService,
    AmlMonitoringListener,
    WATCHLIST_PROVIDER,
  ],
})
export class AmlModule {}
