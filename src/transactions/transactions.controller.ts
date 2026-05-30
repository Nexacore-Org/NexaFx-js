import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import {
  TransactionsService,
  TransferDto,
  ReverseTransactionDto,
  TransactionFilters,
} from './transactions.service';
import { TransactionStatus } from './transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

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

  @UseGuards(JwtAuthGuard)
  @Post(':id/reverse')
  reverse(
    @Param('id') id: string,
    @Body() body: ReverseTransactionDto,
    @Req() request: { user?: { sub?: string; role?: string } },
  ) {
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return this.txService.reverseTransaction(id, {
      reversedBy: request.user?.sub ?? '',
      reason: body.reason,
    });
  }
}
