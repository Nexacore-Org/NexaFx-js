import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Big from 'big.js';
import { FeeTierEntity, KycFeeLevel } from './entities/fee-tier.entity';

@Injectable()
export class FeeTiersService {
  constructor(
    @InjectRepository(FeeTierEntity)
    private readonly feeTierRepo: Repository<FeeTierEntity>,
  ) {}

  async findAll(): Promise<FeeTierEntity[]> {
    return this.feeTierRepo.find({ where: { isActive: true }, order: { kycLevel: 'ASC', currency: 'ASC', tierMin: 'ASC' } });
  }

  async findOne(id: string): Promise<FeeTierEntity> {
    const tier = await this.feeTierRepo.findOne({ where: { id } });
    if (!tier) throw new NotFoundException(`Fee tier ${id} not found`);
    return tier;
  }

  private findTier(kycLevel: KycFeeLevel, currency: string, amount: number): Promise<FeeTierEntity | null> {
    // Half-open range [tierMin, tierMax); a null tierMax is the open-ended top tier.
    return this.feeTierRepo
      .createQueryBuilder('t')
      .where('t.kycLevel = :kycLevel', { kycLevel })
      .andWhere('t.currency = :currency', { currency })
      .andWhere('t.isActive = true')
      .andWhere('t.tierMin <= :amount', { amount })
      .andWhere('(t.tierMax IS NULL OR t.tierMax > :amount)', { amount })
      .orderBy('t.tierMin', 'DESC')
      .limit(1)
      .getOne();
  }

  async findByKycLevelAndAmount(kycLevel: KycFeeLevel, currency: string, amount: number): Promise<FeeTierEntity | null> {
    return this.findTier(kycLevel, currency, amount);
  }

  async calculateFee(kycLevel: KycFeeLevel, currency: string, amount: number): Promise<{ tier: FeeTierEntity | null; feeAmount: number; totalAmount: number }> {
    const tier = await this.findTier(kycLevel, currency, amount);

    if (!tier) {
      return { tier: null, feeAmount: 0, totalAmount: amount };
    }

    let fee = new Big(0);
    if (tier.percentageFee > 0) {
      fee = fee.plus(new Big(amount).times(Number(tier.percentageFee)).div(100));
    }
    if (tier.flatFee > 0) {
      fee = fee.plus(Number(tier.flatFee));
    }

    return {
      tier,
      feeAmount: Number(fee.toFixed(8)),
      totalAmount: Number(new Big(amount).plus(fee).toFixed(8)),
    };
  }
}
