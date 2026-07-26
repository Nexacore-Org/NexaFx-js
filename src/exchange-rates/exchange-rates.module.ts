import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ExchangeRateCacheEntity } from './entities/exchange-rate-cache.entity';
import { ExchangeRateHistoryEntity } from './entities/exchange-rate-history.entity';
import { ExchangeRateCache } from './cache/exchange-rates.cache';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRateCacheEntity, ExchangeRateHistoryEntity]),
    ScheduleModule.forRoot(),
    HttpModule,
  ],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService, ExchangeRateCache],
  exports: [ExchangeRatesService, ExchangeRateCache],
})
export class ExchangeRatesModule {}
