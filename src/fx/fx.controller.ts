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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotentRoute } from '../idempotency/idempotency.decorator';
import { RequireFeature } from '../modules/feature-flags/require-feature.decorator';
import { FeatureFlag } from '../modules/feature-flags/feature-flags.catalog';

const exchangeRateCacheTtlSeconds = parseInt(
  process.env.EXCHANGE_RATES_CACHE_TTL_SECONDS ||
    process.env.CACHE_EXCHANGE_RATE_TTL_SECONDS ||
    '60',
  10,
);

@Controller('fx')
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
  @RequireFeature(FeatureFlag.FX_TRADING)
  @IdempotentRoute()
  executeTrade(
    @Body() dto: ExecuteTradeDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.fxService.executeTrade({ ...dto, userId });
  }

  @Post('trades/:id/reverse')
  @RequireFeature(FeatureFlag.FX_TRADING)
  @IdempotentRoute()
  reverseTrade(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.fxService.reverseTrade(id, userId);
  }

  @Get('volume')
  getVolume(@Query('base') base?: string, @Query('target') target?: string) {
    return this.fxService.getVolume(base, target);
  }
}
