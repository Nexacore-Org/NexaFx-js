import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  TransactionsService,
  TransferDto,
  TransactionFilters,
} from './transactions.service';
import { TransactionStatus } from './transaction.entity';

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
}
