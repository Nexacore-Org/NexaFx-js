import { Controller, Get, Param, Query, Request, UseGuards, BadRequestException, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { WalletBalanceService } from '../services/wallet-balance.service';
import { StatementService } from '../services/statement.service';
import { PortfolioService } from '../services/portfolio.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { TransactionEntity, TransactionDirection } from '../../transactions/entities/transaction.entity';

@ApiTags('Wallets')
@ApiBearerAuth('access-token')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletBalanceService: WalletBalanceService,
    private readonly statementService: StatementService,
    private readonly portfolioService: PortfolioService,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
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

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get wallet transaction history with cursor-based pagination' })
  @ApiParam({ name: 'id', description: 'Wallet UUID' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination (timestamp)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page (max 100)' })
  @ApiQuery({ name: 'direction', required: false, enum: ['DEBIT', 'CREDIT'], description: 'Filter by direction' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'from', required: false, description: 'Filter by start date (ISO 8601)' })
  @ApiQuery({ name: 'to', required: false, description: 'Filter by end date (ISO 8601)' })
  async getWalletTransactions(
    @Param('id') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
    @Query('direction') direction?: TransactionDirection,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const cursorDate = cursor ? new Date(cursor) : undefined;

    const queryBuilder = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.category', 'category')
      .where('tx.walletId = :walletId', { walletId });

    // Apply filters
    if (direction) {
      queryBuilder.andWhere('tx.direction = :direction', { direction });
    }

    if (status) {
      queryBuilder.andWhere('tx.status = :status', { status });
    }

    if (from) {
      queryBuilder.andWhere('tx.createdAt >= :from', { from: new Date(from) });
    }

    if (to) {
      queryBuilder.andWhere('tx.createdAt <= :to', { to: new Date(to) });
    }

    // Apply cursor-based pagination
    if (cursorDate) {
      queryBuilder.andWhere('tx.createdAt < :cursorDate', { cursorDate });
    }

    // Order by createdAt DESC for cursor-based pagination
    queryBuilder.orderBy('tx.createdAt', 'DESC').limit(limitNum + 1);

    const transactions = await queryBuilder.getMany();

    // Determine if there are more pages
    const hasMore = transactions.length > limitNum;
    if (hasMore) {
      transactions.pop(); // Remove the extra item used to check for more pages
    }

    // Format response with category enrichment
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.direction,
      status: tx.status,
      description: tx.description,
      toAddress: tx.toAddress,
      fromAddress: tx.fromAddress,
      category: tx.category ? {
        id: tx.category.id,
        name: tx.category.name,
        type: tx.category.type,
      } : null,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    }));

    // Return cursor for next page
    const nextCursor = hasMore && transactions.length > 0 
      ? transactions[transactions.length - 1].createdAt.toISOString()
      : null;

    return {
      data: formattedTransactions,
      pagination: {
        nextCursor,
        hasMore,
        limit: limitNum,
      },
    };
  }
}
