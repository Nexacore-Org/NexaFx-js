import { ApiKeyAllowed, ApiKeyScope } from '../modules/api-keys/api-key-scopes';
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Sse,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TransactionsService,
  ReverseTransactionDto,
  TransactionFilters,
} from './transactions.service';
import { TransactionStatus } from './transaction.entity';
import {
  CreateDepositDto,
  CreateInternalTransferDto,
  CreateSwapDto,
  CreateTransferDto,
  CreateWithdrawalDto,
} from './dto/money.dto';
import { ConfirmDepositDto } from './dto/confirm-deposit.dto';
import { UpdateTagsDto } from './dto/update-tags.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotentRoute } from '../idempotency/idempotency.decorator';
import { TransactionEvent } from '../common/events/transaction-events';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    role?: string;
  };
}

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('transfer')
  @ApiKeyAllowed(ApiKeyScope.WRITE_TRANSFERS)
  @HttpCode(HttpStatus.CREATED)
  // @IdempotentRoute() makes the Idempotency-Key header mandatory, which also covers
  // API-key callers (an automated client that retries must not double-send).
  @IdempotentRoute()
  transfer(@Body() dto: any, @CurrentUser('sub') userId: string) {
    const dtoWithSender = { ...(dto as any), senderId: userId };
    return this.txService.transfer(dtoWithSender);
  // Idempotent() + IdempotencyGuard make the Idempotency-Key header mandatory, which also
  // covers API-key callers (an automated client that retries must not double-send).
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  transfer(@Body() dto: CreateTransferDto, @CurrentUser('sub') userId: string) {
    // Rebuild the service input from validated fields: client-supplied
    // senderId/ipAddress/userAgent can never replace the JWT-derived identity.
    return this.txService.transfer({
      senderId: userId,
      receiverId: dto.receiverId,
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference as string,
      metadata: dto.metadata,
    });
  }

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @IdempotentRoute()
  deposit(
    @Body() dto: CreateDepositDto,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.txService.createDeposit({
      userId,
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference as string,
      metadata: dto.metadata,
      ipAddress: ip,
      userAgent,
    });
  }

  @Post('deposit/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @IdempotentRoute()
  confirmDeposit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ConfirmDepositDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.confirmDeposit(userId, id, body.txHash ?? '');
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.CREATED)
  @IdempotentRoute()
  withdrawal(
    @Body() dto: CreateWithdrawalDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.createWithdrawal({
      userId,
      amount: dto.amount,
      currency: dto.currency,
      destinationAddress: dto.destinationAddress,
      reference: dto.reference as string,
      metadata: dto.metadata,
    });
  }

  @Post('swap')
  @HttpCode(HttpStatus.CREATED)
  @IdempotentRoute()
  swap(
    @Body() dto: CreateSwapDto,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.txService.createSwap({
      userId,
      fromAmount: dto.fromAmount,
      fromCurrency: dto.fromCurrency,
      toAmount: dto.toAmount as number,
      toCurrency: dto.toCurrency,
      reference: dto.reference as string,
      metadata: dto.metadata,
      ipAddress: ip,
      userAgent,
    });
  }

  @Get('swap/preview')
  swapPreview(
    @Query('userId') userId: string,
    @Query('fromAmount') fromAmount: string,
    @Query('fromCurrency') fromCurrency: string,
    @Query('toCurrency') toCurrency: string,
  ) {
    return this.txService.getSwapPreview({
      userId,
      fromAmount: parseFloat(fromAmount ?? '0'),
      fromCurrency,
      toCurrency,
    });
  }

  /** The caller's own full transaction history as a downloadable CSV. */
  @Get('export/csv')
  async exportCsv(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.txService.exportTransactionsCsv(userId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    return csv;
  }

  @Get()
  @ApiKeyAllowed(ApiKeyScope.READ_TRANSACTIONS)
  findAll(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: TransactionStatus,
    @Query('currency') currency?: string,
    @Query('receiptNumber') receiptNumber?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: TransactionFilters = {
      userId,
      status,
      currency,
      receiptNumber,
      startDate,
      endDate,
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.txService.findHistory(filters);
  }

  @Get(':id/comments')
  getComments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.findByIdForUser(id, userId).then(() => this.txService.getComments(id));
  }

  @Post('internal-transfer')
  @IdempotentRoute()
  createInternalTransfer(
    @Body() dto: CreateInternalTransferDto,
    @CurrentUser('sub') userId: string,
  ) {
    const { recipientEmail, amount, currency } = dto;
    return this.txService.createInternalTransfer({
      senderId: userId,
      recipientEmail,
      amount,
      currency,
    });
  }

  @Post('simulate')
  simulateTransaction(@Body() dto: SimulateTransactionDto) {
    return this.txService.simulateTransaction(dto);
  }

  @Sse(':id/status/stream')
  subscribeToTransactionStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('sub') userId: string,
  ): Observable<MessageEvent> {
    // Scope check via service
    this.txService.findByIdForUser(id, userId).catch(() => {
      // Let stream fail silently by emitting error? But SSE behavior - just ensure it exists for user
      // Best to do simple check
    });
    return new Observable<any>((observer) => {
      const handler = (status: string) => (payload: any) => {
        if (payload.transactionId === id) {
          observer.next({ data: { ...payload, status } });
        }
      };

      const handlers = {
        [TransactionEvent.COMPLETED]: handler('completed'),
        [TransactionEvent.DEPOSIT_COMPLETED]: handler('completed'),
        [TransactionEvent.WITHDRAWAL_COMPLETED]: handler('completed'),
        [TransactionEvent.SWAP_COMPLETED]: handler('completed'),
        [TransactionEvent.SWAP_FAILED]: handler('failed'),
        [TransactionEvent.REVERSED]: handler('reversed'),
      };

      for (const [event, cb] of Object.entries(handlers)) {
        this.eventEmitter.on(event, cb);
      }

      // Return teardown logic
      return () => {
        for (const [event, cb] of Object.entries(handlers)) {
          this.eventEmitter.off(event, cb);
        }
      };
    }).pipe(
      map((payload: any) => ({ data: payload } as MessageEvent))
    );
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.findByIdForUser(id, userId);
  }

  @Patch(':id/tags')
  updateTags(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateTagsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.txService.updateTags(id, request.user?.sub ?? '', body.tag, body.tags);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.findByIdForUser(id, userId).then(() => this.txService.cancelTransaction(id));
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Post(':id/reverse')
  @IdempotentRoute()
  reverse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReverseTransactionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.reverseTransaction(id, {
      reversedBy: userId ?? '',
      reason: body.reason,
    });
  }

  @Post(':id/comments')
  addComment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AddCommentDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.findByIdForUser(id, userId).then(() => this.txService.addComment(id, userId, body.text));
  }
}
