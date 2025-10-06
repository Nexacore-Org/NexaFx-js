import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { AddCurrencyDto, UpdateCurrencyDto } from './dto/currency.dto';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get('supported')
  getSupported() {
    return this.currenciesService.getSupported();
  }

  @Get(':code/details')
  getDetails(@Param('code') code: string) {
    return this.currenciesService.getDetails(code);
  }

  @Post('admin/add')
  add(@Body() body: AddCurrencyDto) {
    return this.currenciesService.addCurrency(body);
  }

  @Patch('admin/:code/update')
  update(@Param('code') code: string, @Body() body: UpdateCurrencyDto) {
    return this.currenciesService.updateCurrency(code, body);
  }

  @Post('admin/:code/enable')
  enable(@Param('code') code: string) {
    return this.currenciesService.setEnabled(code, true);
  }

  @Post('admin/:code/disable')
  disable(@Param('code') code: string) {
    return this.currenciesService.setEnabled(code, false);
  }

  @Get('admin/volumes')
  getVolumes() {
    return this.currenciesService.getVolumes();
  }

  @Get('admin/liquidity')
  getLiquidity() {
    return this.currenciesService.getLiquidity();
  }
}


