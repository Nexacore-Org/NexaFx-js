import { Controller, Get, Query } from '@nestjs/common';
import { TransactionsService } from '../services/transactions.service';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly txService: TransactionsService) {}

  // ✅ NEW SEARCH ENDPOINT
  @Get('search')
  search(@Query() query: SearchTransactionsDto) {
    return this.txService.search(query);
  }
  @Get(':id/enrichment')
async getEnrichment(@Param('id') id: string) {
  const enrichment = await this.enrichmentService.getEnrichment(id);

  return {
    success: true,
    data: enrichment,
  };
}
