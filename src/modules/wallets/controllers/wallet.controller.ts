import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { WalletBalanceService } from '../services/wallet-balance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletBalanceService: WalletBalanceService) {}

  @Get(':id/balance')
  getBalance(@Param('id') walletId: string) {
    return this.walletBalanceService.getBalance(walletId);
  }

  @Get('portfolio')
  getPortfolio(
    @Request() req: any,
    @Query('displayCurrency') displayCurrency?: string,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.walletBalanceService.getPortfolio(userId, displayCurrency);
  }
}
