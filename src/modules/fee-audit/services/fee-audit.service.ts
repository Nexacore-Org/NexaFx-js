import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FeeAuditLogEntity,
  FeeType,
} from '../entities/fee-audit-log.entity';

@Injectable()
export class FeeAuditService {
  private readonly logger = new Logger(FeeAuditService.name);

  constructor(
    @InjectRepository(FeeAuditLogEntity)
    private readonly auditRepo: Repository<FeeAuditLogEntity>,
  ) {}

  async recordFeeCalculation(params: {
    transactionId?: string;
    userId?: string;
    feeAmount: number;
    feeCurrency: string;
    feeType: FeeType;
    calculatedAmount?: number;
    appliedTier?: string;
  }): Promise<FeeAuditLogEntity> {
    const record = this.auditRepo.create({
      transactionId: params.transactionId,
      userId: params.userId,
      feeAmount: params.feeAmount,
      feeCurrency: params.feeCurrency,
      feeType: params.feeType,
      calculatedAmount: params.calculatedAmount,
      appliedTier: params.appliedTier,
    });

    return this.auditRepo.save(record);
  }

  async queryAuditTrail(filters: {
    userId?: string;
    transactionId?: string;
    feeType?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: FeeAuditLogEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const qb = this.auditRepo.createQueryBuilder('log');

    if (filters.userId) {
      qb.andWhere('log.userId = :userId', { userId: filters.userId });
    }

    if (filters.transactionId) {
      qb.andWhere('log.transactionId = :transactionId', {
        transactionId: filters.transactionId,
      });
    }

    if (filters.feeType) {
      qb.andWhere('log.feeType = :feeType', { feeType: filters.feeType });
    }

    qb.orderBy('log.createdAt', 'DESC');
    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
