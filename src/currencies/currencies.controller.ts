import { Controller, Get, Post, Body, Header, UseInterceptors } from '@nestjs/common';
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
  @Header('Cache-Control', `public, max-age=${supportedCurrenciesTtlSeconds}`)
  @Get()
  getSupportedCurrencies() {
    return this.currenciesService.listSupportedCurrencies();
  }

  @Post('convert-issuer')
  convertAssetIssuer(@Body() body: { code: string; fromIssuer: string; toIssuer: string; amount: number }) {
    return this.currenciesService.convertAssetIssuer(body.code, body.fromIssuer, body.toIssuer, body.amount);
  }
}
