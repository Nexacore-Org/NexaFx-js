import { Controller, Get, Param, Query, Request, UseGuards, BadRequestException, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { WalletBalanceService } from '../services/wallet-balance.service';
import { StatementService } from '../services/statement.service';
import { PortfolioService } from '../services/portfolio.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('Wallets')
@ApiBearerAuth('access-token')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletBalanceService: WalletBalanceService,
    private readonly statementService: StatementService,
    private readonly portfolioService: PortfolioService,
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

  @Get('portfolio/history')
  @ApiOperation({ summary: 'Get portfolio value history (daily snapshots)' })
  @ApiQuery({ name: 'from', description: 'Start date ISO 8601', required: true })
  @ApiQuery({ name: 'to', description: 'End date ISO 8601', required: true })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPortfolioHistory(
    @Request() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    if (!from || !to) throw new BadRequestException('from and to query params are required');
    const userId = req.user?.id ?? req.user?.sub;
    const limitNum = Math.min(parseInt(limit, 10) || 30, 365);
    return this.portfolioService.getHistory(userId, new Date(from), new Date(to), parseInt(page, 10) || 1, limitNum);
  }

  @Get('portfolio/summary')
  @ApiOperation({ summary: 'Get portfolio summary: current value, 7d/30d change, ATH/ATL' })
  async getPortfolioSummary(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.portfolioService.getSummary(userId);
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

  @Get(':id/statement/pdf')
  @ApiOperation({ summary: 'Download wallet statement as PDF' })
  @ApiParam({ name: 'id', description: 'Wallet UUID' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async getStatementPdf(
    @Param('id') walletId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    if (!from || !to) throw new BadRequestException('from and to query params are required');
    const { pdf, checksum } = await this.statementService.generateStatementPdf(
      walletId,
      new Date(from),
      new Date(to),
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${walletId}.pdf"`,
      'X-Checksum': checksum,
    });
    res.send(pdf);
  }
}
