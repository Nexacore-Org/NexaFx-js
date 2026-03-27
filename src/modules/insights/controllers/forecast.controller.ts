import { Controller, Get, NotFoundException, Param, Query, Request } from '@nestjs/common';
import { ForecastService } from '../services/forecast.service';
import { CashflowService } from '../services/cashflow.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// We resolve wallet balance from user context — inject WalletEntity
import { WalletEntity } from '../../users/entities/wallet.entity';

@Controller()
export class ForecastController {
  constructor(
    private readonly forecastService: ForecastService,
    private readonly cashflowService: CashflowService,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
  ) {}

  /**
   * GET /wallets/:id/forecast
   * Returns 30/60/90-day projected balance for the wallet.
   */
  @Get('wallets/:id/forecast')
  async walletForecast(@Param('id') walletId: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id ?? 'unknown';

    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    return this.forecastService.forecastWalletBalance(
      walletId,
      userId,
      Number(wallet.availableBalance),
      'USD',
    );
  }

  /**
   * GET /goals/:id/forecast
   * Returns estimated completion date for a savings goal.
   */
  @Get('goals/:id/forecast')
  async goalForecast(@Param('id') goalId: string) {
    return this.forecastService.forecastGoal(goalId);
  }

  /**
   * GET /insights/cashflow
   * Returns upcoming transactions for the next 30 days.
   */
  @Get('insights/cashflow')
  async cashflow(@Query('walletId') walletId: string, @Request() req: any) {
    if (!walletId) {
      throw new NotFoundException('walletId query parameter is required');
    }

    const upcoming = await this.cashflowService.getUpcomingTransactions(walletId);
    return {
      walletId,
      upcomingTransactions: upcoming,
      count: upcoming.length,
      label: 'Upcoming transactions are estimates based on recurring patterns. Actual transactions may differ.',
    };
  }
}
