/**
 * PATCH — Apply RiskPreTradeGuard to the transaction creation endpoint.
 * Merge with your existing TransactionsController.
 */

import {
  Body,
  Controller,
  Post,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // adjust import path
import { RiskPreTradeGuard } from './guards/risk-pre-trade.guard';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * POST /transactions
   *
   * Guard order:
   *   1. JwtAuthGuard  — authentication
   *   2. RiskPreTradeGuard — synchronous risk gate (blocks with 403 if risk check fails)
   *
   * If RiskPreTradeGuard throws ForbiddenException the request never reaches the handler.
   * The 403 body contains { statusCode, message, reason, currentMetrics }.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RiskPreTradeGuard)
  async createTransaction(
    @Request() req,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(req.user.id, dto);
  }
}