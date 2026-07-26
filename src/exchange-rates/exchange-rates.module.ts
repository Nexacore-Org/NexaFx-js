import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExchangeRateCache } from './cache/exchange-rates.cache';

@Module({
  imports: [HttpModule],
  providers: [ExchangeRateCache],
  exports: [ExchangeRateCache],
})
export class ExchangeRatesModule {}
