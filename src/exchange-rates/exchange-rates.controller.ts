import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { ExchangeRatesService } from './exchange-rates.service';
import { QueryExchangeRateHistoryDto } from './dto/query-exchange-rate-history.dto';

@ApiTags('Exchange Rates')
@Controller('api/v1/exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current exchange rates' })
  @ApiOkResponse({ description: 'Current exchange rates for all supported pairs' })
  async getRates() {
    const rates = await this.exchangeRatesService.getRates();
    return {
      success: true,
      data: rates,
    };
  }

  @Get('public')
  @ApiOperation({ summary: 'Public exchange rates endpoint' })
  async getPublicRates() {
    const rates = await this.exchangeRatesService.getRates();
    return {
      success: true,
      data: rates,
    };
  }

  @Get(':pair')
  @ApiOperation({ summary: 'Get current rate for a specific pair' })
  @ApiQuery({ name: 'pair', description: 'Currency pair (e.g. USD/NGN)' })
  async getRateByPair(@Param('pair') pair: string) {
    const rate = await this.exchangeRatesService.getRateByPair(pair);
    return {
      success: true,
      data: rate,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get exchange rate history' })
  @ApiQuery({ name: 'pair', required: false, description: 'Filter by currency pair' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  async getHistory(@Query() query: QueryExchangeRateHistoryDto) {
    return this.exchangeRatesService.getHistory(query);
  }
}
