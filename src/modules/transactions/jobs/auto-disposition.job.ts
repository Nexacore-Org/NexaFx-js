import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiskScoringService } from '../services/risk-scoring.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Transaction, ReviewStatus } from '../entities/transaction.entity';

@Injectable()
export class AutoDispositionJob {
  private readonly logger = new Logger(AutoDispositionJob.name);

  constructor(
    private riskService: RiskScoringService,
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoDisposition() {
    this.logger.log('Running Auto-Disposition Engine...');

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    // 1. LOW Risk -> APPROVED after 1h
    const lowRiskToApprove = await this.transactionRepo.find({
      where: {
        reviewStatus: ReviewStatus.PENDING_REVIEW,
        riskScore: LessThan(30), // Example "Low" threshold
        createdAt: LessThan(oneHourAgo),
      },
    });

    for (const tx of lowRiskToApprove) {
      await this.riskService.processDisposition(tx.id, 'APPROVE', 'SYSTEM_AUTO');
    }

    // 2. HIGH Risk -> ESCALATED after 6h
    const highRiskToEscalate = await this.transactionRepo.find({
      where: {
        reviewStatus: ReviewStatus.PENDING_REVIEW,
        riskScore: LessThan(101), // Logic: riskScore > 80 (handled via query or filter)
        createdAt: LessThan(sixHoursAgo),
      },
    });

    // Idempotency check: only process if not already flagged for escalation
    for (const tx of highRiskToEscalate.filter(t => t.riskScore > 80)) {
       tx.reviewStatus = ReviewStatus.ESCALATED;
       await this.transactionRepo.save(tx);
       this.logger.warn(`Transaction ${tx.id} escalated due to high risk SLA breach.`);
    }
  }
}