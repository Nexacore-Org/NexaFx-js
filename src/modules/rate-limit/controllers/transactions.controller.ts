import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TransactionsService } from '../services/transactions.service';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';
import { EnrichmentService } from '../../enrichment/enrichment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';
import {
  RateLimitGuard,
  RateLimit,
} from '../../rate-limit/guards/rate-limit.guard';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ tier: 'standard' })
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly enrichmentService: EnrichmentService,
  ) {}

  @Get('search')
  @SkipAudit()
  @ApiOperation({ summary: 'Search transactions with filters' })
  @ApiResponse({ status: 200, description: 'Paginated transaction results' })
  search(@Query() query: SearchTransactionsDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.txService.search(query, userId);
  }

  @Get(':id/enrichment')
  @SkipAudit()
  @ApiOperation({ summary: 'Get enrichment data for a transaction' })
  @ApiResponse({ status: 200, description: 'Transaction enrichment data' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getEnrichment(@Param('id') id: string) {
    const enrichment = await this.enrichmentService.getEnrichment(id);
    return {
      success: true,
      data: enrichment,
    };
  }
}
