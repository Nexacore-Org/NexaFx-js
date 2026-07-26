import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { FeeReportEntity, FeeReportPeriod } from '../entities/fee-report.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { GenerateFeeReportDto } from '../dto/generate-fee-report.dto';
import { ListFeeReportsDto } from '../dto/list-fee-reports.dto';

@Injectable()
export class FeeReportsService {
  constructor(
    @InjectRepository(FeeReportEntity)
    private readonly feeReportRepo: Repository<FeeReportEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async findAll(userId: string, dto: ListFeeReportsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.feeReportRepo
      .createQueryBuilder('fr')
      .where('fr.userId = :userId', { userId })
      .orderBy('fr.generatedAt', 'DESC');

    if (dto.period) {
      qb.andWhere('fr.period = :period', { period: dto.period });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async generate(userId: string, dto: GenerateFeeReportDto): Promise<FeeReportEntity> {
    const { startDate, endDate } = this.resolveDateRange(dto.period, dto.startDate, dto.endDate);

    const transactions = await this.txRepo.find({
      where: {
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'ASC' },
    });

    const feeBreakdown: Record<string, number> = {};
    let totalFees = 0;

    for (const tx of transactions) {
      if (tx.metadata?.fee && tx.currency) {
        const fee = Number(tx.metadata.fee);
        totalFees += fee;
        feeBreakdown[tx.currency] = (feeBreakdown[tx.currency] ?? 0) + fee;
      }
    }

    const report = this.feeReportRepo.create({
      userId,
      period: dto.period,
      startDate,
      endDate,
      totalFees,
      feeBreakdown,
      generatedAt: new Date(),
    });

    return this.feeReportRepo.save(report);
  }

  private resolveDateRange(
    period: FeeReportPeriod,
    startStr?: string,
    endStr?: string,
  ): { startDate: Date; endDate: Date } {
    const endDate = endStr ? new Date(endStr) : new Date();
    let startDate: Date;

    if (startStr) {
      startDate = new Date(startStr);
    } else {
      startDate = new Date(endDate);
      switch (period) {
        case 'daily':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'weekly':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'monthly':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
      }
    }

    return { startDate, endDate };
  }
}
