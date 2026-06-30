import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionStatus,
} from '../../transactions/transaction.entity';
import { User } from '../../users/user.entity';

export interface RevenueReport {
  totalFees: number;
  currency: string;
  from: Date;
  to: Date;
}

export interface VolumeReport {
  currency: string;
  type?: string;
  status?: TransactionStatus;
  count: number;
  totalAmount: number;
}

export interface UserGrowthReport {
  week: string;
  registrations: number;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async revenueReport(
    from: Date,
    to: Date,
    currency: string,
  ): Promise<RevenueReport> {
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.fee), 0)', 'totalFees')
      .where('tx.currency = :currency', { currency })
      .andWhere('tx.createdAt >= :from', { from })
      .andWhere('tx.createdAt <= :to', { to })
      .andWhere('tx.status = :status', { status: TransactionStatus.COMPLETED })
      .getRawOne<{ totalFees: string }>();

    return {
      totalFees: parseFloat(result?.totalFees ?? '0'),
      currency,
      from,
      to,
    };
  }

  async transactionVolume(
    from: Date,
    to: Date,
    filters: { currency?: string; status?: TransactionStatus } = {},
  ): Promise<VolumeReport[]> {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .select('tx.currency', 'currency')
      .addSelect('tx.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'totalAmount')
      .where('tx.createdAt >= :from', { from })
      .andWhere('tx.createdAt <= :to', { to })
      .groupBy('tx.currency')
      .addGroupBy('tx.status');

    if (filters.currency)
      qb.andWhere('tx.currency = :currency', { currency: filters.currency });
    if (filters.status)
      qb.andWhere('tx.status = :status', { status: filters.status });

    const rows = await qb.getRawMany<{
      currency: string;
      status: string;
      count: string;
      totalAmount: string;
    }>();
    return rows.map((r) => ({
      currency: r.currency,
      status: r.status as TransactionStatus,
      count: parseInt(r.count, 10),
      totalAmount: parseFloat(r.totalAmount),
    }));
  }

  async userGrowth(from: Date, to: Date): Promise<UserGrowthReport[]> {
    const rows = await this.userRepo
      .createQueryBuilder('u')
      .select("TO_CHAR(DATE_TRUNC('week', u.createdAt), 'YYYY-MM-DD')", 'week')
      .addSelect('COUNT(*)', 'registrations')
      .where('u.createdAt >= :from', { from })
      .andWhere('u.createdAt <= :to', { to })
      .groupBy("DATE_TRUNC('week', u.createdAt)")
      .orderBy("DATE_TRUNC('week', u.createdAt)", 'ASC')
      .getRawMany<{ week: string; registrations: string }>();

    return rows.map((r) => ({
      week: r.week,
      registrations: parseInt(r.registrations, 10),
    }));
  }
}
