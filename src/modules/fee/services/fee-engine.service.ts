import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeRuleEntity } from '../entities/fee-rule.entity';
import { SimulateFeeDto } from '../dto/simulate-fee.dto';

export interface AppliedFeeSnapshot {
  ruleId: string;
  ruleType: string;
  feeAmount: number;
  currency: string;
  appliedAt: Date;
}

@Injectable()
export class FeeEngineService {
  private readonly logger = new Logger(FeeEngineService.name);

  constructor(
    @InjectRepository(FeeRuleEntity)
    private readonly ruleRepo: Repository<FeeRuleEntity>,
  ) {}

  /**
   * Evaluate and return the highest-priority applicable fee for a given amount/currency.
   */
  async evaluate(
    amount: number,
    currency: string,
    promoCode?: string,
  ): Promise<AppliedFeeSnapshot | null> {
    const now = new Date();

    const rules = await this.ruleRepo
      .createQueryBuilder('r')
      .where('r.isActive = true')
      .andWhere('r.currency = :currency', { currency })
      .andWhere('(r.expiresAt IS NULL OR r.expiresAt > :now)', { now })
      .andWhere('(r.minAmount IS NULL OR r.minAmount <= :amount)', { amount })
      .andWhere('(r.maxAmount IS NULL OR r.maxAmount >= :amount)', { amount })
      .orderBy('r.priority', 'ASC')
      .getMany();

    // Promotional rules take priority if promo code matches
    const promoRule = promoCode
      ? rules.find(
          (r) => r.ruleType === 'PROMOTIONAL' && r.promoCode === promoCode,
        )
      : null;

    const applicableRule = promoRule ?? rules[0] ?? null;

    if (!applicableRule) {
      this.logger.debug(`No fee rule found for ${currency} amount ${amount}`);
      return null;
    }

    const feeAmount = this.calculateFee(amount, applicableRule);

    return {
      ruleId: applicableRule.id,
      ruleType: applicableRule.ruleType,
      feeAmount,
      currency,
      appliedAt: now,
    };
  }

  async simulate(dto: SimulateFeeDto) {
    const snapshot = await this.evaluate(
      dto.amount,
      dto.currency,
      dto.promoCode,
    );

    return {
      success: true,
      input: dto,
      appliedFee: snapshot
        ? { ...snapshot }
        : { feeAmount: 0, ruleType: 'NONE', note: 'No matching fee rule' },
      totalAmount: dto.amount + (snapshot?.feeAmount ?? 0),
    };
  }

  private calculateFee(amount: number, rule: FeeRuleEntity): number {
    let fee = 0;

    if (rule.percentage) {
      fee += (amount * Number(rule.percentage)) / 100;
    }

    if (rule.flatFee) {
      fee += Number(rule.flatFee);
    }

    return Math.round(fee * 1e8) / 1e8; // precision to 8 decimal places
  }
}
