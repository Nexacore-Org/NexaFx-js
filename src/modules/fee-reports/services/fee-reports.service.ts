import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Big from 'big.js';
import { FeeReportEntity, FeeReportPeriod } from '../entities/fee-report.entity';
import { FeeRecord } from '../../../fees/fee-record.entity';
import { GenerateFeeReportDto } from '../dto/generate-fee-report.dto';
import { ListFeeReportsDto } from '../dto/list-fee-reports.dto';

@Injectable()
export class FeeReportsService {
  constructor(
    @InjectRepository(FeeReportEntity)
    private readonly feeReportRepo: Repository<FeeReportEntity>,
    @InjectRepository(FeeRecord)
    private readonly feeRecordRepo: Repository<FeeRecord>,
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
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be <= endDate');
    }

    const results = await this.feeRecordRepo
      .createQueryBuilder('f')
      .select('f.currency', 'currency')
      .addSelect('SUM(f.feeAmount)', 'total')
      .where('f.userId = :userId', { userId })
      .andWhere('f.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .groupBy('f.currency')
      .getRawMany();

    const feeBreakdown: Record<string, number> = {};
    let totalFees = new Big(0);

    for (const r of results) {
      const currency = r.currency;
      const total = new Big(r.total || 0).toString();
      const totalNum = Number(total);
      feeBreakdown[currency] = totalNum;
      totalFees = totalFees.plus(total);
    }

    const report = this.feeReportRepo.create({
      userId,
      period: dto.period,
      startDate,
      endDate,
      totalFees: Number(totalFees.toString()),
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
