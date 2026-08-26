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
    const feeAmount = Number((amount * this.getFeeRate(transactionType)).toFixed(8));

    this.feeAuditService.recordFeeCalculation({
      feeAmount,
      currency,
      feeType: 'percentage',
      calculatedAmount: amount,
      appliedTier: 'flat',
    }).catch((err) => this.logger.warn(`Failed to record fee audit: ${err.message}`));

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
    return this.feeRepo.save(record);
  }
}
