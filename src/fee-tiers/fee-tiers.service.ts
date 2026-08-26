import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findByKycLevelAndAmount(kycLevel: KycFeeLevel, currency: string, amount: number): Promise<FeeTierEntity | null> {
    return this.feeTierRepo
      .createQueryBuilder('t')
      .where('t.kycLevel = :kycLevel', { kycLevel })
      .andWhere('t.currency = :currency', { currency })
      .andWhere('t.isActive = true')
      .andWhere('t.tierMin <= :amount', { amount })
      .andWhere('t.tierMax >= :amount', { amount })
      .getOne();
  }

  async calculateFee(kycLevel: KycFeeLevel, currency: string, amount: number): Promise<{ tier: FeeTierEntity | null; feeAmount: number; totalAmount: number }> {
    const tier = await this.feeTierRepo
      .createQueryBuilder('t')
      .where('t.kycLevel = :kycLevel', { kycLevel })
      .andWhere('t.currency = :currency', { currency })
      .andWhere('t.isActive = true')
      .andWhere('t.tierMin <= :amount', { amount })
      .andWhere('t.tierMax >= :amount', { amount })
      .getOne();

    if (!tier) {
      return { tier: null, feeAmount: 0, totalAmount: amount };
    }

    let feeAmount = 0;
    if (tier.percentageFee > 0) {
      feeAmount += (amount * Number(tier.percentageFee)) / 100;
    }
    if (tier.flatFee > 0) {
      feeAmount += Number(tier.flatFee);
    }
    feeAmount = Math.round(feeAmount * 1e8) / 1e8;

    return {
      tier,
      feeAmount,
      totalAmount: Math.round((amount + feeAmount) * 1e8) / 1e8,
    };
  }
}
