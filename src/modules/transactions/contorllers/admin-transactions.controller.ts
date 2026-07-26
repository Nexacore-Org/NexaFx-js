import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ReplayTransactionDto } from '../dto/replay-transaction.dto';
import { RollbackTransactionDto } from '../dto/rollback-transaction.dto';
import { TransactionReplayService } from '../services/transaction-replay.service';
import { TransactionRollbackService } from '../services/transaction-rollback.service';
import { AdminGuard } from '../../auth/guards/admin.guard';

@ApiTags('Admin - Transactions')
@ApiBearerAuth('access-token')
@Controller('admin/transactions')
@UseGuards(AdminGuard)
export class AdminTransactionsController {
  constructor(
    private readonly replayService: TransactionReplayService,
    private readonly rollbackService: TransactionRollbackService,
  ) {}

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay a failed transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiOkResponse({ description: 'Transaction replayed successfully' })
  async replayTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReplayTransactionDto,
  ) {
    return this.replayService.replay(id, body);
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: 'Rollback a completed transaction (admin only)' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiOkResponse({ description: 'Transaction rolled back successfully' })
  async rollbackTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RollbackTransactionDto,
    @Request() req: any,
  ) {
    const adminUserId = req.user?.id || req.user?.sub;
    return this.rollbackService.rollback(id, body, adminUserId);
  }
}
