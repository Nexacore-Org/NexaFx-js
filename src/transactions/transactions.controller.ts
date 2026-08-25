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
} from '@nestjs/common';
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

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    role?: string;
  };
}

@Controller('api/v1/transactions')
export class TransactionsController {
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
  transfer(@Body() dto: TransferDto) {
    return this.txService.transfer(dto);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  deposit(
    @Body() dto: DepositDto,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.txService.createDeposit({ ...dto, userId, ipAddress: ip, userAgent });
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  withdrawal(
    @Body() dto: WithdrawalDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.txService.createWithdrawal({ ...dto, userId });
  }

  @Post('swap')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  swap(
    @Body() dto: SwapDto,
    @CurrentUser('sub') userId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.txService.createSwap({ ...dto, userId, ipAddress: ip, userAgent });
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

  @Get()
  findAll(
    @Query('userId') userId?: string,
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
  getComments(@Param('id') id: string) {
    return this.txService.getComments(id);
  }

  @Post('internal-transfer')
  createInternalTransfer(@Body() dto: { senderId: string; recipientEmail: string; amount: number; currency: string }) {
    return this.txService.createInternalTransfer(dto);
  }

  @Post('simulate')
  simulateTransaction(@Body() dto: { type: string; amount: number; fromCurrency: string; toCurrency?: string }) {
    return this.txService.simulateTransaction(dto);
  }

  @Sse(':id/status/stream')
  subscribeToTransactionStatus(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable<any>((observer) => {
      const handler = (status: string) => (payload: any) => {
        if (payload.transactionId === id) {
          observer.next({ data: { ...payload, status } });
        }
      };

      const handlers = {
        'transactions.completed': handler('completed'),
        'transactions.deposit.completed': handler('completed'),
        'transactions.withdrawal.completed': handler('completed'),
        'transactions.swap.completed': handler('completed'),
        'transactions.swap.failed': handler('failed'),
        'transactions.reversed': handler('reversed'),
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
  findOne(@Param('id') id: string) {
    return this.txService.findById(id);
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
  cancel(@Param('id') id: string) {
    return this.txService.cancelTransaction(id);
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
    @Body() body: { authorId: string; text: string },
  ) {
    return this.txService.addComment(id, body.authorId, body.text);
  }
}
