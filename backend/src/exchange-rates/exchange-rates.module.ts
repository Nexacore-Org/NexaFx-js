import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRate, RateHistory } from './entities/rate.entity';
import { RateProviderService } from './providers/rate-provider.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRate, RateHistory]),
    HttpModule,
    ScheduleModule,
  ],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService, RateProviderService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}


