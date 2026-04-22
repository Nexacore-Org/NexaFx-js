import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { BankAccountService } from '../services/bank-account.service';
import { BankStatementService } from '../services/bank-statement.service';
import { LinkBankAccountDto } from '../dto/link-bank-account.dto';
import { VerifyBankAccountDto } from '../dto/verify-bank-account.dto';
import { CreateBankDepositDto, CreateBankWithdrawalDto } from '../dto/bank-transfer.dto';
import { PaymentRailWebhookDto } from '../dto/payment-rail-webhook.dto';
import { BankAccountResponseDto } from '../dto/bank-account-response.dto';
import { TransactionResponseDto } from '../../../transactions/dtos/transaction-response.dto';
import type { Response } from 'express';

@ApiTags('Banking')
@ApiBearerAuth('access-token')
@Controller()
export class BankAccountController {
  constructor(
    private readonly bankAccountService: BankAccountService,
    private readonly bankStatementService: BankStatementService,
  ) {}

  @Post('bank-accounts')
  @ApiOperation({ summary: 'Link a bank account and initiate micro-deposit verification' })
  @ApiBody({ type: LinkBankAccountDto })
  @ApiResponse({ status: 201, type: BankAccountResponseDto })
  linkBankAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: LinkBankAccountDto,
  ) {
    return this.bankAccountService.linkBankAccount(user.userId, dto);
  }

  @Post('bank-accounts/:id/verify')
  @ApiOperation({ summary: 'Verify a bank account with micro-deposit amounts' })
  @ApiBody({ type: VerifyBankAccountDto })
  @ApiResponse({ status: 201, type: BankAccountResponseDto })
  verifyBankAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: VerifyBankAccountDto,
  ) {
    return this.bankAccountService.verifyBankAccount(user.userId, id, dto);
  }

  @Post('deposits/bank')
  @ApiOperation({ summary: 'Initiate a bank deposit into the wallet' })
  @ApiBody({ type: CreateBankDepositDto })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  createBankDeposit(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBankDepositDto,
  ) {
    return this.bankAccountService.createBankDeposit(user.userId, dto);
  }

  @Post('withdrawals/bank')
  @ApiOperation({ summary: 'Initiate a bank withdrawal and reserve wallet balance' })
  @ApiBody({ type: CreateBankWithdrawalDto })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  createBankWithdrawal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBankWithdrawalDto,
  ) {
    return this.bankAccountService.createBankWithdrawal(user.userId, dto);
  }

  @Public()
  @Post('banking/webhooks/payment-rail')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process payment rail settlement webhook' })
  @ApiBody({ type: PaymentRailWebhookDto })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  handlePaymentRailWebhook(@Body() dto: PaymentRailWebhookDto) {
    return this.bankAccountService.applySettlementWebhook(dto);
  }

  /** GET /bank-accounts/:id/transfers */
  @Get('bank-accounts/:id/transfers')
  @ApiOperation({ summary: 'Get paginated transfer history for a bank account' })
  getTransferHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bankStatementService.getTransferHistory(
      user.userId,
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** GET /bank-accounts/:id/statement?month=YYYY-MM */
  @Get('bank-accounts/:id/statement')
  @ApiOperation({ summary: 'Generate CSV bank statement for a given month' })
  async getStatement(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('month') month: string,
    @Res() res: Response,
  ) {
    const result = await this.bankStatementService.generateStatement(user.userId, id, month);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  }
}
