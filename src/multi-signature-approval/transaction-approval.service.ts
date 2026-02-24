import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import {
  TransactionApproval,
  ApprovalDecision,
} from '../entities/transaction-approval.entity';
import {
  DEFAULT_APPROVAL_THRESHOLDS,
  HIGH_VALUE_THRESHOLD_USD,
  HIGH_VALUE_REQUIRED_APPROVALS,
} from './approval-thresholds.config';
import { ApproveTransactionDto, RejectTransactionDto } from '../dto/approval.dto';

export interface ApproverContext {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class TransactionApprovalService {
  private readonly logger = new Logger(TransactionApprovalService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(TransactionApproval)
    private readonly approvalRepo: Repository<TransactionApproval>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Determine if a transaction requires approval based on amount/currency thresholds
   */
  requiresApproval(amount: number, currency: string): boolean {
    const threshold = this.getThreshold(currency);
    return amount >= threshold.minAmount;
  }

  /**
   * Get required approval count for a given amount and currency
   */
  getRequiredApprovals(amount: number, currency: string): number {
    const threshold = this.getThreshold(currency);
    if (amount >= HIGH_VALUE_THRESHOLD_USD) {
      return HIGH_VALUE_REQUIRED_APPROVALS;
    }
    return threshold.requiredApprovals;
  }

  /**
   * Mark a transaction as pending approval and set required approvals count
   */
  async markPendingApproval(
    transaction: Transaction,
  ): Promise<Transaction> {
    const required = this.getRequiredApprovals(transaction.amount, transaction.currency);
    transaction.status = TransactionStatus.PENDING_APPROVAL;
    transaction.requiresApproval = true;
    transaction.requiredApprovals = required;
    transaction.currentApprovals = 0;
    return this.transactionRepo.save(transaction);
  }

  /**
   * Approve a transaction
   */
  async approveTransaction(
    transactionId: string,
    approver: ApproverContext,
    dto: ApproveTransactionDto,
  ): Promise<{ transaction: Transaction; approval: TransactionApproval }> {
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { id: transactionId },
        relations: ['approvals'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      this.assertCanBeActedOn(transaction);
      await this.assertNotAlreadyActed(transaction.id, approver.id);
      this.assertNotTransactionOwner(transaction, approver.id);

      const approval = manager.create(TransactionApproval, {
        transactionId,
        approverId: approver.id,
        approverEmail: approver.email,
        approverRole: approver.role,
        decision: ApprovalDecision.APPROVED,
        comment: dto.comment,
      });

      await manager.save(TransactionApproval, approval);

      // Increment approval count
      transaction.currentApprovals += 1;

      // Check if quorum reached
      if (transaction.currentApprovals >= transaction.requiredApprovals) {
        transaction.status = TransactionStatus.APPROVED;
        this.logger.log(
          `Transaction ${transactionId} reached approval quorum (${transaction.currentApprovals}/${transaction.requiredApprovals}). Status: APPROVED`,
        );
      }

      const savedTransaction = await manager.save(Transaction, transaction);

      this.logger.log(
        `Transaction ${transactionId} approved by ${approver.email}. Approvals: ${transaction.currentApprovals}/${transaction.requiredApprovals}`,
      );

      return { transaction: savedTransaction, approval };
    });
  }

  /**
   * Reject a transaction
   */
  async rejectTransaction(
    transactionId: string,
    approver: ApproverContext,
    dto: RejectTransactionDto,
  ): Promise<{ transaction: Transaction; approval: TransactionApproval }> {
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { id: transactionId },
        relations: ['approvals'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException(`Transaction ${transactionId} not found`);
      }

      this.assertCanBeActedOn(transaction);
      await this.assertNotAlreadyActed(transaction.id, approver.id);
      this.assertNotTransactionOwner(transaction, approver.id);

      const approval = manager.create(TransactionApproval, {
        transactionId,
        approverId: approver.id,
        approverEmail: approver.email,
        approverRole: approver.role,
        decision: ApprovalDecision.REJECTED,
        comment: dto.comment,
      });

      await manager.save(TransactionApproval, approval);

      // Any rejection immediately rejects the transaction
      transaction.status = TransactionStatus.REJECTED;
      transaction.rejectionReason = dto.comment ?? 'Rejected by approver';

      const savedTransaction = await manager.save(Transaction, transaction);

      this.logger.log(
        `Transaction ${transactionId} rejected by ${approver.email}. Reason: ${dto.comment}`,
      );

      return { transaction: savedTransaction, approval };
    });
  }

  /**
   * Get all approvals for a transaction
   */
  async getApprovals(transactionId: string): Promise<TransactionApproval[]> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    return this.approvalRepo.find({
      where: { transactionId },
      order: { timestamp: 'ASC' },
    });
  }

  /**
   * Get pending approval transactions (for admin dashboard)
   */
  async getPendingApprovalTransactions(): Promise<Transaction[]> {
    return this.transactionRepo.find({
      where: { status: TransactionStatus.PENDING_APPROVAL },
      relations: ['approvals'],
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private getThreshold(currency: string) {
    const specific = DEFAULT_APPROVAL_THRESHOLDS.find(
      (t) => t.currency === currency.toUpperCase(),
    );
    return specific ?? DEFAULT_APPROVAL_THRESHOLDS.find((t) => t.currency === '*')!;
  }

  private assertCanBeActedOn(transaction: Transaction): void {
    if (transaction.status !== TransactionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Transaction is not pending approval. Current status: ${transaction.status}`,
      );
    }
  }

  private async assertNotAlreadyActed(
    transactionId: string,
    approverId: string,
  ): Promise<void> {
    const existing = await this.approvalRepo.findOne({
      where: { transactionId, approverId },
    });

    if (existing) {
      throw new BadRequestException(
        `You have already ${existing.decision.toLowerCase()} this transaction`,
      );
    }
  }

  private assertNotTransactionOwner(
    transaction: Transaction,
    approverId: string,
  ): void {
    if (transaction.userId === approverId) {
      throw new ForbiddenException(
        'Transaction initiator cannot approve their own transaction',
      );
    }
  }
}
