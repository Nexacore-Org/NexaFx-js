import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { UseInterceptors } from '@nestjs/common';
import { FxService, ExecuteTradeDto } from './fx.service';

const exchangeRateCacheTtlSeconds = parseInt(
  process.env.EXCHANGE_RATES_CACHE_TTL_SECONDS ||
    process.env.CACHE_EXCHANGE_RATE_TTL_SECONDS ||
    '60',
  10,
);

@Controller('api/v1/fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @UseInterceptors(CacheInterceptor)
  @CacheTTL(exchangeRateCacheTtlSeconds)
  @Header('Cache-Control', `public, max-age=${exchangeRateCacheTtlSeconds}`)
  @Get('rates')
  getRates(@Query('base') base: string, @Query('target') target: string) {
    return this.fxService.getRates(base, target);
  }

  @Post('trades')
  @HttpCode(HttpStatus.CREATED)
  executeTrade(@Body() dto: ExecuteTradeDto) {
    return this.fxService.executeTrade(dto);
  }

  @Post('trades/:id/reverse')
  reverseTrade(@Param('id') id: string) {
    return this.fxService.reverseTrade(id);
  }
}
