import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Transaction, TransactionStatus } from '../../transactions/transaction.entity';
import { AmlAlert } from '../../aml/aml-alert.entity';

/** Monthly compliance figures computed from real data, with no hardcoded values (issue #1389). */
@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(AmlAlert) private readonly alertRepo: Repository<AmlAlert>,
  ) {}

  async monthlyReport(period: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('period must be YYYY-MM');
    }
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1) - 1);
    const range = Between(periodStart, periodEnd);
    const [totalTransactionsCount, flaggedAmlIncidents] = await Promise.all([
      this.txRepo.count({ where: { status: TransactionStatus.COMPLETED, createdAt: range } }),
      this.alertRepo.count({ where: { createdAt: range } }),
    ]);
    return { period, periodStart, periodEnd, metrics: { totalTransactionsCount, flaggedAmlIncidents } };
  }
}
