import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { WalletsService } from './wallets.service';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':accountId')
  getBalances(@Param('accountId') accountId: string) {
    return this.walletsService.getBalancesForAccount(accountId);
  }

  @Post('adjust-balance')
  adjustBalance(@Body() dto: AdjustBalanceDto) {
    return this.walletsService.adjustBalance(
      dto.accountId,
      dto.currency,
      dto.delta,
    );
  }
}
