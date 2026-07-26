import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  TransactionsService,
  TransferDto,
  ReverseTransactionDto,
  TransactionFilters,
  DepositDto,
  WithdrawalDto,
  SwapDto,
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
  constructor(private readonly txService: TransactionsService) {}

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
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

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('status') status?: TransactionStatus,
    @Query('currency') currency?: string,
    @Query('receiptNumber') receiptNumber?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: TransactionFilters = {
      userId,
      status,
      currency,
      receiptNumber,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.txService.findHistory(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.txService.findById(id);
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
}
