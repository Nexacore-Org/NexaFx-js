import {
  Body, Controller, Get, Post, Query, Param, UseGuards, UseInterceptors, Request,
  Headers, HttpCode, HttpStatus,
  Body, Controller, Get, Post, Query, Param, UseGuards, Request,
  Headers, HttpCode, HttpStatus, Delete,
  Headers, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiParam,
  ApiCreatedResponse, ApiHeader, ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { TransactionsService } from '../services/transactions.service';
import { TransactionAnnotationService } from '../services/transaction-annotation.service';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { AddNoteDto } from '../dto/add-note.dto';
import { AddTagDto } from '../dto/add-tag.dto';
import { BulkTagDto } from '../dto/bulk-tag.dto';
import { EnrichmentService } from '../../enrichment/enrichment.service';
import { ReceiptService } from '../services/receipt.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { RiskPreTradeGuard } from '../../risk-engine/services/risk-pre-trade.guard';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';
import { IdempotencyService } from '../../../idempotency/idempotency.service';
import { IdempotencyGuard } from '../../../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { Idempotent } from '../../../idempotency/idempotency.decorator';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly annotationService: TransactionAnnotationService,
    private readonly enrichmentService: EnrichmentService,
    private readonly idempotencyService: IdempotencyService,
    private readonly receiptService: ReceiptService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @UseGuards(RiskPreTradeGuard)
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key (min 16 chars) to prevent duplicate submissions', required: true })
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

  @Get(':id/receipt/pdf')
  @ApiOperation({ summary: 'Download transaction receipt as PDF' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  async getReceiptPdf(@Param('id') id: string, @Res() res: Response) {
    const { pdf, checksum } = await this.receiptService.generateReceiptPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
      'X-Checksum': checksum,
    });
    res.send(pdf);
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

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiCreatedResponse({ description: 'Note added successfully' })
  async addNote(@Param('id') id: string, @Body() dto: AddNoteDto, @Request() req: any) {
    const userId = req.user?.id;
    const note = await this.annotationService.addNote(id, userId, dto.content);
    return { success: true, data: note };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction with annotations' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiOkResponse({ description: 'Transaction with notes and tags' })
  async getTransaction(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    const transaction = await this.annotationService.getTransactionWithAnnotations(id, userId);
    return { success: true, data: transaction };
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add a tag to a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiCreatedResponse({ description: 'Tag added successfully' })
  async addTag(@Param('id') id: string, @Body() dto: AddTagDto, @Request() req: any) {
    const userId = req.user?.id;
    const tag = await this.annotationService.addTag(id, userId, dto.tag);
    return { success: true, data: tag };
  }

  @Delete(':id/tags/:tag')
  @ApiOperation({ summary: 'Remove a tag from a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiParam({ name: 'tag', description: 'Tag name' })
  @ApiOkResponse({ description: 'Tag removed successfully' })
  async removeTag(@Param('id') id: string, @Param('tag') tag: string, @Request() req: any) {
    const userId = req.user?.id;
    await this.annotationService.removeTag(id, userId, tag);
    return { success: true };
  }

  @Get('search/tag')
  @SkipAudit()
  @ApiOperation({ summary: 'Search transactions by tag' })
  @ApiOkResponse({ description: 'Transactions with specified tag' })
  async searchByTag(@Query('tag') tag: string, @Query('page') page = 1, @Query('limit') limit = 20, @Request() req: any) {
    const userId = req.user?.id;
    const result = await this.annotationService.searchTransactionsByTag(userId, tag, page, limit);
    return { success: true, data: result };
  }

  @Get('search/notes')
  @SkipAudit()
  @ApiOperation({ summary: 'Search transactions by note content' })
  @ApiOkResponse({ description: 'Transactions with notes matching query' })
  async searchByNotes(@Query('notes') query: string, @Query('page') page = 1, @Query('limit') limit = 20, @Request() req: any) {
    const userId = req.user?.id;
    const result = await this.annotationService.searchTransactionsByNotes(userId, query, page, limit);
    return { success: true, data: result };
  }

  @Get('tags')
  @SkipAudit()
  @ApiOperation({ summary: 'Get all user tags with usage count' })
  @ApiOkResponse({ description: 'User tags with counts' })
  async getUserTags(@Request() req: any) {
    const userId = req.user?.id;
    const tags = await this.annotationService.getUserTags(userId);
    return { success: true, data: tags };
  }

  @Post('bulk-tag')
  @ApiOperation({ summary: 'Apply tag to multiple transactions' })
  @ApiCreatedResponse({ description: 'Bulk tagging completed' })
  async bulkTag(@Body() dto: BulkTagDto, @Request() req: any) {
    const userId = req.user?.id;
    const result = await this.annotationService.bulkTagTransactions(userId, dto.filter, dto.tag, dto.maxTransactions);
    return { success: true, data: result };
  }

  @Get('analytics/tags')
  @SkipAudit()
  @ApiOperation({ summary: 'Get spending analytics grouped by tags' })
  @ApiOkResponse({ description: 'Tag-based spending analytics' })
  async getTagAnalytics(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const userId = req.user?.id;
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    const analytics = await this.annotationService.getTagAnalytics(userId, start, end);
    return { success: true, data: analytics };
  }
}
