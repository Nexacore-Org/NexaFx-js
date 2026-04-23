import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ReconciliationIssueEntity } from '../entities/reconciliation-issue.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

@Injectable()
export class ReconciliationAnalyticsService {
  private readonly logger = new Logger(ReconciliationAnalyticsService.name);

  constructor(
    @InjectRepository(ReconciliationIssueEntity)
    private readonly issueRepo: Repository<ReconciliationIssueEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async getSummary() {
    const [totalIssues, autoResolved, escalated, typeBreakdownRaw, totalTxs] = await Promise.all([
      this.issueRepo.count(),
      this.issueRepo.count({ where: { status: 'AUTO_RESOLVED' } }),
      this.issueRepo.count({ where: { status: 'ESCALATED' } }),
      this.issueRepo.createQueryBuilder('issue')
        .select('issue.mismatchType', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('issue.mismatchType')
        .getRawMany(),
      this.txRepo.count(),
    ]);

    const mismatchRate = totalTxs > 0 ? (totalIssues / totalTxs) * 100 : 0;
    const autoResolutionRate = totalIssues > 0 ? (autoResolved / totalIssues) * 100 : 0;

    const typeBreakdown = typeBreakdownRaw.reduce((acc, curr) => {
      acc[curr.type] = parseInt(curr.count, 10);
      return acc;
    }, {});

    return {
      mismatchRate: parseFloat(mismatchRate.toFixed(2)),
      autoResolutionRate: parseFloat(autoResolutionRate.toFixed(2)),
      escalationBacklog: escalated,
      typeBreakdown,
      totalIssues,
      totalTransactions: totalTxs,
    };
  }

  async getDailyMismatchCounts(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const counts = await this.issueRepo.createQueryBuilder('issue')
      .select("DATE_TRUNC('day', issue.createdAt)", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('issue.createdAt >= :startDate', { startDate })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany();

    return counts.map(c => ({
      date: new Date(c.day).toISOString().split('T')[0],
      count: parseInt(c.count, 10),
    }));
  }
}
