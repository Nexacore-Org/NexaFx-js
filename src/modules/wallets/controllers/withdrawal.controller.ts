import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { IsNumber, IsString, IsUUID, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TransactionsService } from '../../../transactions/transactions.service';

const beneficiaryCooldowns = new Map<string, number>();
const BENEFICIARY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
 * Withdrawal endpoint — deducts from wallet balance and creates a transaction record
 * by delegating to the real, working TransactionsService.createWithdrawal() flow.
 */
@Controller('api/v1/withdrawals')
@UseGuards(JwtAuthGuard)
export class WithdrawalController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async initiateWithdrawal(
    @Body() dto: WithdrawalDto,
    @Request() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;
    const cooldownKey = `${userId}:${dto.beneficiaryId}`;
    const firstSeenAt = beneficiaryCooldowns.get(cooldownKey);
    const now = Date.now();
    if (!firstSeenAt) {
      beneficiaryCooldowns.set(cooldownKey, now);
      throw new ForbiddenException(
        'New beneficiary requires a 24-hour cooldown before first transfer use',
      );
    }
    if (now - firstSeenAt < BENEFICIARY_COOLDOWN_MS) {
      throw new ForbiddenException(
        'New beneficiary requires a 24-hour cooldown before first transfer use',
      );
    }

    const transaction = await this.transactionsService.createWithdrawal({
      userId,
      amount: dto.amount,
      currency: dto.currency,
      reference: `wd_${userId}_${now}`,
      destinationAddress: dto.beneficiaryId,
    });

    return { success: true, data: transaction };
  }
}
