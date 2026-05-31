import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  TransactionsService,
  TransferDto,
  ReverseTransactionDto,
  TransactionFilters,
} from './transactions.service';
import { TransactionStatus } from './transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';

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

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('status') status?: TransactionStatus,
    @Query('currency') currency?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: TransactionFilters = {
      userId,
      status,
      currency,
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
    @Req() request: AuthenticatedRequest,
  ) {
    return this.txService.reverseTransaction(id, {
      reversedBy: request.user?.sub ?? '',
      reason: body.reason,
    });
  }
}
