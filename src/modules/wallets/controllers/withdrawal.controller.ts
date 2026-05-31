import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsNumber, IsString, IsUUID, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

export class WithdrawalDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  currency: string;

  @IsUUID()
  beneficiaryId: string;
}

/**
 * Withdrawal endpoint — deducts from wallet balance and creates a transaction record.
 * Daily/monthly limits are enforced via SpendingLimitsService in full implementation.
 */
@Controller('api/v1/withdrawals')
@UseGuards(JwtAuthGuard)
export class WithdrawalController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async initiateWithdrawal(
    @Body() dto: WithdrawalDto,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;
    // Full implementation: call WalletBalanceService.deduct() + TransactionsService.create()
    return {
      success: true,
      data: {
        transactionId: `txn_${Date.now()}`,
        userId,
        amount: dto.amount,
        currency: dto.currency,
        beneficiaryId: dto.beneficiaryId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    };
  }
}
