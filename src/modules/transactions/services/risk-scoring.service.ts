import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, ReviewStatus, TransactionStatus } from '../entities/transaction.entity';

@Injectable()
export class RiskScoringService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    private dataSource: DataSource,
  ) {}

  async getRiskQueue() {
    return this.transactionRepo.find({
      where: { reviewStatus: ReviewStatus.PENDING_REVIEW },
      order: { riskScore: 'DESC' },
    });
  }

  async overrideRiskScore(transactionId: string, newScore: number, reason: string, adminId: string) {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) throw new NotFoundException('Transaction not found');

    const auditEntry = {
      adminId,
      originalScore: transaction.riskScore,
      newScore,
      reason,
      timestamp: new Date(),
    };

    transaction.riskScore = newScore;
    transaction.riskOverrideLog = [...(transaction.riskOverrideLog || []), auditEntry];
    
    return this.transactionRepo.save(transaction);
  }

  async processDisposition(transactionId: string, action: 'APPROVE' | 'REJECT', adminId?: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tx = await queryRunner.manager.findOne(Transaction, { where: { id: transactionId } });
      if (!tx) throw new NotFoundException('Transaction not found');

      if (action === 'APPROVE') {
        tx.reviewStatus = ReviewStatus.APPROVED;
      } else {
        tx.reviewStatus = ReviewStatus.REJECTED;
        // Trigger reversal only if COMPLETED (as per constraints)
        if (tx.status === TransactionStatus.COMPLETED) {
          await this.triggerReversalFlow(tx, queryRunner.manager);
        }
      }

      const result = await queryRunner.manager.save(tx);
      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async triggerReversalFlow(transaction: Transaction, manager: any) {
    // Logic to initiate refund/reversal on the ledger
    transaction.status = TransactionStatus.REVERSED;
    await manager.save(transaction);
  }
}