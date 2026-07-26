import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ExchangeRateCacheEntity } from './entities/exchange-rate-cache.entity';
import { ExchangeRateHistoryEntity } from './entities/exchange-rate-history.entity';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRateCacheEntity, ExchangeRateHistoryEntity]),
    ScheduleModule.forRoot(),
  ],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
