import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LedgerService } from './ledger.service';

/** Read-only: ledger rows are immutable, so no update/delete routes exist. */
@ApiTags('ledger')
@ApiBearerAuth()
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('me')
  @ApiOperation({ summary: "Paginated statement of the caller's ledger entries" })
  me(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ledger.findByUser(userId, { page: Number(page), limit: Number(limit) });
  }
}
