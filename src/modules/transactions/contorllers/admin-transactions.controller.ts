import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReplayTransactionDto } from '../dto/replay-transaction.dto';
import { TransactionReplayService } from '../services/transaction-replay.service';
import { AdminGuard } from '../../auth/guards/admin.guard'; // adjust to your project

@Controller('admin/transactions')
@UseGuards(AdminGuard)
export class AdminTransactionsController {
  constructor(private readonly replayService: TransactionReplayService) {}

  @Post(':id/replay')
  async replayTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReplayTransactionDto,
  ) {
    return this.replayService.replay(id, body);
  }
}
