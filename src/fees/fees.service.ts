import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeRecord } from './fee-record.entity';
import { FeeAuditService } from '../modules/fee-audit/services/fee-audit.service';

export interface FeeResult {
  feeAmount: number;
  reason: string | null;
}

export interface RecordFeeDto {
  transactionId: string;
  userId: string;
  transactionType: string;
  amount: number;
  feeAmount: number;
  currency: string;
  reason?: string | null;
}

const DEFAULT_FEE_RATE = 0.001; // 0.1% flat fee
const WITHDRAWAL_FEE_RATE = 0.005; // 0.5% flat fee

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    @InjectRepository(FeeRecord)
    private readonly feeRepo: Repository<FeeRecord>,
    private readonly feeAuditService: FeeAuditService,
  ) {}

  private getFeeRate(transactionType: string): number {
    return transactionType === 'withdrawal' ? WITHDRAWAL_FEE_RATE : DEFAULT_FEE_RATE;
  }

  calculateFee(amount: number, transactionType = 'default', currency = 'USD'): FeeResult {
    // Pure calculation: no audit side effects (previews/simulations call this too).
    const feeAmount = Number((amount * this.getFeeRate(transactionType)).toFixed(8));

    return { feeAmount, reason: null };
  }

  previewFee(transactionType: string, amount: number, currency = 'USD') {
    const feeRate = this.getFeeRate(transactionType);
    const feeAmount = Number((amount * feeRate).toFixed(8));
    const netAmount = Number((amount - feeAmount).toFixed(8));
    return {
      transactionType,
      amount,
      feeAmount,
      netAmount,
      currency,
      feePercentage: feeRate * 100,
    };
  }

  async recordFee(dto: RecordFeeDto): Promise<FeeRecord> {
    const record = this.feeRepo.create({
      transactionId: dto.transactionId,
      userId: dto.userId,
      transactionType: dto.transactionType,
      amount: dto.amount,
      feeAmount: dto.feeAmount,
      currency: dto.currency,
      reason: dto.feeAmount === 0 ? (dto.reason ?? 'no_fee_config') : (dto.reason ?? null),
    });
    const saved = await this.feeRepo.save(record);

    // Audit only fees that are actually charged, with the real currency, user and transaction.
    this.feeAuditService
      .recordFeeCalculation({
        transactionId: dto.transactionId,
        userId: dto.userId,
        feeAmount: dto.feeAmount,
        feeCurrency: dto.currency,
        feeType: 'percentage',
        calculatedAmount: dto.amount,
        appliedTier: 'flat',
      })
      .catch((err) =>
        this.logger.error(
          `Failed to record fee audit for transaction ${dto.transactionId}: ${err.message}`,
        ),
      );

    return saved;
  }
}
