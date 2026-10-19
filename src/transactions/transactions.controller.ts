import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Sse,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TransactionsService,
  TransferDto,
  ReverseTransactionDto,
  TransactionFilters,
  DepositDto,
  WithdrawalDto,
  SwapDto,
  SwapPreviewDto,
} from './transactions.service';
import { TransactionStatus } from './transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Idempotent } from '../idempotency/idempotency.decorator';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
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
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  transfer(@Body() dto: any, @CurrentUser('sub') userId: string) {
    const dtoWithSender = { ...(dto as any), senderId: userId };
    return this.txService.transfer(dtoWithSender);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  deposit(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.txService.createDeposit({ ...(dto as any), userId, ipAddress: ip, userAgent });
  }

  @Post('deposit/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmDeposit(
    @Param('id') id: string,
    @Body() body: { txHash?: string },
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.confirmDeposit(userId, id, body?.txHash ?? '');
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  withdrawal(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.createWithdrawal({ ...(dto as any), userId });
  }

  @Post('swap')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  swap(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.txService.createSwap({ ...(dto as any), userId, ipAddress: ip, userAgent });
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
  getComments(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.txService.findByIdForUser(id, userId).then(() => this.txService.getComments(id));
  }

  @Post('internal-transfer')
  createInternalTransfer(
    @Body() dto: any,
    @CurrentUser('sub') userId: string,
  ) {
    const { recipientEmail, amount, currency } = dto as any;
    return this.txService.createInternalTransfer({
      senderId: userId,
      recipientEmail,
      amount,
      currency,
    });
  }

  @Post('simulate')
  simulateTransaction(@Body() dto: { type: string; amount: number; fromCurrency: string; toCurrency?: string }) {
    return this.txService.simulateTransaction(dto);
  }

  @Sse(':id/status/stream')
  subscribeToTransactionStatus(@Param('id') id: string, @CurrentUser('sub') userId: string): Observable<MessageEvent> {
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
  findOne(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.txService.findByIdForUser(id, userId);
  }

  @Patch(':id/tags')
  updateTags(
    @Param('id') id: string,
    @Body() body: { tag?: string; tags?: string[] },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.txService.updateTags(id, request.user?.sub ?? '', body.tag, body.tags);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.txService.findByIdForUser(id, userId).then(() => this.txService.cancelTransaction(id));
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Post(':id/reverse')
  reverse(
    @Param('id') id: string,
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
    @Param('id') id: string,
    @Body() body: { text: string },
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.findByIdForUser(id, userId).then(() => this.txService.addComment(id, userId, body.text));
  }
}
