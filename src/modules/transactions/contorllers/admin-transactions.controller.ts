import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ReplayTransactionDto } from '../dto/replay-transaction.dto';
import { TransactionReplayService } from '../services/transaction-replay.service';
import { AdminGuard } from '../../auth/guards/admin.guard';

@ApiTags('Admin - Transactions')
@ApiBearerAuth('access-token')
@Controller('admin/transactions')
@UseGuards(AdminGuard)
export class AdminTransactionsController {
  constructor(private readonly replayService: TransactionReplayService) {}

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
}
