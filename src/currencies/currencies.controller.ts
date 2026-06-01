import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { CurrenciesService } from './currencies.service';

const supportedCurrenciesTtlSeconds = parseInt(
  process.env.CACHE_SUPPORTED_CURRENCIES_TTL_SECONDS || '86400',
  10,
);

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @UseInterceptors(CacheInterceptor)
  @CacheKey('supported-currencies')
  @CacheTTL(supportedCurrenciesTtlSeconds)
  @Get()
  getSupportedCurrencies() {
    return this.currenciesService.listSupportedCurrencies();
  }
}
