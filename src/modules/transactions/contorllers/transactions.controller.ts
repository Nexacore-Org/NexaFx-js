import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { TransactionsService } from '../services/transactions.service';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';
import { EnrichmentService } from '../../enrichment/enrichment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly enrichmentService: EnrichmentService,
  ) {}

  // ✅ NEW SEARCH ENDPOINT with wallet aliases
  @Get('search')
  @SkipAudit()
  search(@Query() query: SearchTransactionsDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.txService.search(query, userId);
  }

  @Get(':id/enrichment')
  @SkipAudit()
  async getEnrichment(@Param('id') id: string) {
    const enrichment = await this.enrichmentService.getEnrichment(id);

    return {
      success: true,
      data: enrichment,
    };
  }
}
