import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { Idempotent } from '../idempotency/idempotency.decorator';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { LedgerService } from './ledger.service';
import {
  CreateDoubleEntryDto,
  ReconciliationQueryDto,
  ReconciliationResultDto,
  LedgerBalanceDto,
} from './dto/ledger.dto';
import { JwtAuthGuard } from '../modules/auth/guards/jwt.guard';
import { AdminGuard } from '../modules/auth/guards/admin.guard';

@ApiTags('Ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('entries')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiCreatedResponse({ description: 'Double-entry posted successfully' })
  @ApiOperation({ summary: 'Post a balanced double-entry transaction' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key to prevent duplicate ledger entries (min 16 chars)', required: true })
  async postDoubleEntry(@Body() dto: CreateDoubleEntryDto) {
    return this.ledgerService.postDoubleEntry(dto);
  }

  @Get('reconcile')
  @ApiOkResponse({ type: ReconciliationResultDto })
  @ApiOperation({ summary: 'Run ledger reconciliation' })
  async reconcile(@Query() query: ReconciliationQueryDto): Promise<ReconciliationResultDto> {
    return this.ledgerService.reconcile(query);
  }

  @Get('integrity')
  @ApiOperation({ summary: 'Run full integrity validation across all transactions' })
  async runIntegrityValidation() {
    return this.ledgerService.runIntegrityValidation();
  }

  @Get('transactions/:transactionId/entries')
  @Roles('admin', 'finance')
  @ApiOperation({ summary: 'Get all ledger entries for a transaction' })
  async getEntriesByTransaction(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.ledgerService.getEntriesByTransaction(transactionId);
  }

  @Get('transactions/:transactionId/verify')
  @Roles('admin', 'finance')
  @ApiOperation({ summary: 'Verify integrity of a specific transaction' })
  async verifyTransactionIntegrity(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    const isValid = await this.ledgerService.verifyTransactionIntegrity(transactionId);
    return { transactionId, isValid };
  }

  @Get('accounts/:accountId/balance')
  @ApiOperation({ summary: 'Get derived balance for an account from ledger' })
  async getAccountBalance(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query('currency') currency: string,
  ): Promise<LedgerBalanceDto> {
    return this.ledgerService.getAccountBalance(accountId, currency);
  }
}
