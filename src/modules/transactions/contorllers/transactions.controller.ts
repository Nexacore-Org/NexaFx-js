import {
  Body, Controller, Get, Post, Query, Param, UseGuards, Request,
  Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiParam,
  ApiCreatedResponse, ApiHeader,
} from '@nestjs/swagger';
import { TransactionsService } from '../services/transactions.service';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { EnrichmentService } from '../../enrichment/enrichment.service';
import { ReceiptService } from '../services/receipt.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { RiskPreTradeGuard } from '../../risk-engine/services/risk-pre-trade.guard';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';
import { IdempotencyService } from '../../../idempotency/idempotency.service';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly enrichmentService: EnrichmentService,
    private readonly idempotencyService: IdempotencyService,
    private readonly receiptService: ReceiptService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RiskPreTradeGuard)
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key to prevent duplicate submissions', required: false })
  @ApiCreatedResponse({ description: 'Transaction created' })
  async create(
    @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.idempotencyService.findByKey(idempotencyKey);
      if (existing) return existing.response;
    }

    const result = await this.txService.createTransaction(dto);

    if (idempotencyKey) {
      await this.idempotencyService.store(
        idempotencyKey,
        this.idempotencyService.hashRequest('POST', '/transactions', dto),
        result,
        201,
      );
    }

    return result;
  }

  @Get('search')
  @SkipAudit()
  @ApiOperation({ summary: 'Search and filter transactions with pagination' })
  @ApiOkResponse({ description: 'Paginated list of transactions' })
  search(@Query() query: SearchTransactionsDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.txService.search(query, userId);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get formatted receipt for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  async getReceipt(@Param('id') id: string) {
    const receipt = await this.receiptService.generateReceipt(id);
    return { success: true, data: receipt };
  }

  @Get(':id/enrichment')
  @SkipAudit()
  @ApiOperation({ summary: 'Get enrichment metadata for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiOkResponse({ description: 'Enrichment data for the transaction' })
  async getEnrichment(@Param('id') id: string) {
    const enrichment = await this.enrichmentService.getEnrichment(id);
    return { success: true, data: enrichment };
  }
}
