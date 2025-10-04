import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { RatesQueryDto, SetMarginDto, UpdateRateDto } from './dto/rate.dto';

@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}

  @Get('current')
  getCurrent(@Query() query: RatesQueryDto) {
    return this.service.getCurrentRates(query.base, query.quote);
  }

  @Get(':fromCurrency/:toCurrency')
  getPair(@Param('fromCurrency') base: string, @Param('toCurrency') quote: string) {
    return this.service.getRate(base, quote);
  }

  @Get('history')
  getHistory(@Query() query: RatesQueryDto) {
    return this.service.getHistory(query.base, query.quote);
  }

  @Post('admin/update')
  manualUpdate(@Body() dto: UpdateRateDto) {
    return this.service.manualUpdate(dto);
  }

  @Post('admin/margin')
  setMargin(@Body() dto: SetMarginDto) {
    return this.service.setMargin(dto);
  }
}


