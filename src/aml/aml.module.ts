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
  providers: [AmlService, AmlScreeningService, AmlMonitoringListener],
  exports: [AmlService, AmlScreeningService, AmlMonitoringListener],
})
export class AmlModule {}
