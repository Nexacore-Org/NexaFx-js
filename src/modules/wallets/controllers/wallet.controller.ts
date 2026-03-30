import { Controller, Get, Param, Query, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WalletBalanceService } from '../services/wallet-balance.service';
import { StatementService } from '../services/statement.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('Wallets')
@ApiBearerAuth('access-token')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletBalanceService: WalletBalanceService,
    private readonly statementService: StatementService,
  ) {}

  @Get(':id/balance')
  @ApiParam({ name: 'id', description: 'Wallet UUID' })
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

  @Get(':id/statement')
  @ApiOperation({ summary: 'Generate wallet statement for a date range' })
  @ApiParam({ name: 'id', description: 'Wallet UUID' })
  @ApiQuery({ name: 'from', description: 'Start date ISO 8601', required: true })
  @ApiQuery({ name: 'to', description: 'End date ISO 8601', required: true })
  async getStatement(
    @Param('id') walletId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!from || !to) throw new BadRequestException('from and to query params are required');
    const statement = await this.statementService.generateStatement(
      walletId,
      new Date(from),
      new Date(to),
    );
    return { success: true, data: statement, checksum: statement.checksum };
  }
}
