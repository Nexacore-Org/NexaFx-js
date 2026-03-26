import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { TransactionsService } from '../services/transactions.service';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';
import { EnrichmentService } from '../../enrichment/enrichment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly enrichmentService: EnrichmentService,
  ) {}

  @Get('search')
  @SkipAudit()
  @ApiOperation({ summary: 'Search and filter transactions with pagination' })
  @ApiOkResponse({ description: 'Paginated list of transactions' })
  search(@Query() query: SearchTransactionsDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.txService.search(query, userId);
  }

  @Get(':id/enrichment')
  @SkipAudit()
  @ApiOperation({ summary: 'Get enrichment metadata for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiOkResponse({ description: 'Enrichment data for the transaction' })
  async getEnrichment(@Param('id') id: string) {
    const enrichment = await this.enrichmentService.getEnrichment(id);

    return {
      success: true,
      data: enrichment,
    };
  }
}
