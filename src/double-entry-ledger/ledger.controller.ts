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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { LedgerService } from './ledger.service';
import {
  CreateDoubleEntryDto,
  ReconciliationQueryDto,
  ReconciliationResultDto,
  LedgerBalanceDto,
} from './dto/ledger.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('entries')
  @Roles('admin', 'system')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ description: 'Double-entry posted successfully' })
  @ApiOperation({ summary: 'Post a balanced double-entry transaction' })
  async postDoubleEntry(@Body() dto: CreateDoubleEntryDto) {
    return this.ledgerService.postDoubleEntry(dto);
  }

  @Get('reconcile')
  @Roles('admin', 'finance')
  @ApiOkResponse({ type: ReconciliationResultDto })
  @ApiOperation({ summary: 'Run ledger reconciliation' })
  async reconcile(@Query() query: ReconciliationQueryDto): Promise<ReconciliationResultDto> {
    return this.ledgerService.reconcile(query);
  }

  @Get('integrity')
  @Roles('admin')
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
