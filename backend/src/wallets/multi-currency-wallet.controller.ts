import { Controller, Get, Param } from '@nestjs/common';
import { MultiCurrencyWalletService } from './multi-currency-wallet.service';

@Controller('wallets')
export class MultiCurrencyWalletController {
  constructor(private readonly service: MultiCurrencyWalletService) {}

  @Get(':userId/multi-currency')
  getBalances(@Param('userId') userId: string) {
    return this.service.getBalances(userId);
  }
}


