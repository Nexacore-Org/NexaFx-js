import { Controller, Get, Param } from '@nestjs/common';
import { WalletsService } from './wallets.service';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':accountId')
  getBalances(@Param('accountId') accountId: string) {
    return this.walletsService.getBalancesForAccount(accountId);
  }
}
