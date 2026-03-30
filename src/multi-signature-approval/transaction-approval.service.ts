import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import { TransactionApproval, ApprovalDecision } from '../entities/transaction-approval.entity';
import {
  DEFAULT_APPROVAL_THRESHOLDS,
  HIGH_VALUE_THRESHOLD_USD,
  HIGH_VALUE_REQUIRED_APPROVALS,
} from './approval-thresholds.config';
import { ApproveTransactionDto, RejectTransactionDto } from '../dto/approval.dto';
import { NotificationService } from '../modules/notifications/services/notification.service';

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
    private readonly notificationService: NotificationService,
  ) {}

  requiresApproval(amount: number, currency: string): boolean {
    return amount >= this.getThreshold(currency).minAmount;
  }

  getRequiredApprovals(amount: number, currency: string): number {
    if (amount >= HIGH_VALUE_THRESHOLD_USD) return HIGH_VALUE_REQUIRED_APPROVALS;
    return this.getThreshold(currency).requiredApprovals;
  }

  async markPendingApproval(transaction: Transaction): Promise<Transaction> {
    transaction.status = TransactionStatus.PENDING_APPROVAL;
    transaction.requiresApproval = true;
    transaction.requiredApprovals = this.getRequiredApprovals(transaction.amount, transaction.currency);
    transaction.currentApprovals = 0;
    return this.transactionRepo.save(transaction);
  }

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
      if (!transaction) throw new NotFoundException(`Transaction ${transactionId} not found`);

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

      transaction.currentApprovals += 1;
      if (transaction.currentApprovals >= transaction.requiredApprovals) {
        transaction.status = TransactionStatus.APPROVED;
      }
      const saved = await manager.save(Transaction, transaction);

      this.logger.log(`Transaction ${transactionId} approved by ${approver.email}`);
      this.notify(saved.userId, 'approval.approved', {
        transactionId,
        approverEmail: approver.email,
        currentApprovals: saved.currentApprovals,
        requiredApprovals: saved.requiredApprovals,
        status: saved.status,
      });

      return { transaction: saved, approval };
    });
  }

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
      if (!transaction) throw new NotFoundException(`Transaction ${transactionId} not found`);

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

      transaction.status = TransactionStatus.REJECTED;
      transaction.rejectionReason = dto.comment ?? 'Rejected by approver';
      const saved = await manager.save(Transaction, transaction);

      this.logger.log(`Transaction ${transactionId} rejected by ${approver.email}`);
      this.notify(saved.userId, 'approval.rejected', {
        transactionId,
        approverEmail: approver.email,
        reason: dto.comment,
      });

      return { transaction: saved, approval };
    });
  }

  async getApprovals(transactionId: string): Promise<TransactionApproval[]> {
    const exists = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!exists) throw new NotFoundException(`Transaction ${transactionId} not found`);
    return this.approvalRepo.find({ where: { transactionId }, order: { timestamp: 'ASC' } });
  }

  async getPendingApprovalTransactions(): Promise<Transaction[]> {
    return this.transactionRepo.find({
      where: { status: TransactionStatus.PENDING_APPROVAL },
      relations: ['approvals'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Admin force-approve: bypasses quorum. Audit-logged with mandatory reason.
   */
  async adminForceApprove(
    transactionId: string,
    admin: ApproverContext,
    reason: string,
  ): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transaction) throw new NotFoundException(`Transaction ${transactionId} not found`);
      if (transaction.status !== TransactionStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          `Transaction is not pending approval. Current status: ${transaction.status}`,
        );
      }

      // Audit record
      await manager.save(
        manager.create(TransactionApproval, {
          transactionId,
          approverId: admin.id,
          approverEmail: admin.email,
          approverRole: admin.role,
          decision: ApprovalDecision.APPROVED,
          comment: `[ADMIN FORCE-APPROVE] ${reason}`,
        }),
      );

      transaction.status = TransactionStatus.APPROVED;
      transaction.currentApprovals = transaction.requiredApprovals;
      const saved = await manager.save(Transaction, transaction);

      this.logger.warn(`Transaction ${transactionId} force-approved by ${admin.email}: ${reason}`);
      this.notify(saved.userId, 'approval.force_approved', { transactionId, adminEmail: admin.email, reason });

      return saved;
    });
  }

  /**
   * Expire stale PENDING_APPROVAL transactions older than windowHours (default 72h).
   * Runs every hour. Uses idempotent status check.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleApprovals(windowHours = 72): Promise<void> {
    const cutoff = new Date(Date.now() - windowHours * 3_600_000);
    const stale = await this.transactionRepo.find({
      where: { status: TransactionStatus.PENDING_APPROVAL, createdAt: LessThan(cutoff) },
    });

    for (const tx of stale) {
      tx.status = TransactionStatus.CANCELLED;
      tx.rejectionReason = `Approval expired after ${windowHours}h`;
      await this.transactionRepo.save(tx);
      this.logger.warn(`Transaction ${tx.id} expired (stale after ${windowHours}h)`);
      this.notify(tx.userId, 'approval.expired', { transactionId: tx.id, expiredAfterHours: windowHours });
    }

    if (stale.length) this.logger.log(`Expired ${stale.length} stale approval transactions`);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private getThreshold(currency: string) {
    return (
      DEFAULT_APPROVAL_THRESHOLDS.find((t) => t.currency === currency.toUpperCase()) ??
      DEFAULT_APPROVAL_THRESHOLDS.find((t) => t.currency === '*')!
    );
  }

  private assertCanBeActedOn(transaction: Transaction): void {
    if (transaction.status !== TransactionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Transaction is not pending approval. Current status: ${transaction.status}`,
      );
    }
  }

  private async assertNotAlreadyActed(transactionId: string, approverId: string): Promise<void> {
    const existing = await this.approvalRepo.findOne({ where: { transactionId, approverId } });
    if (existing) {
      throw new BadRequestException(
        `You have already ${existing.decision.toLowerCase()} this transaction`,
      );
    }
  }

  private assertNotTransactionOwner(transaction: Transaction, approverId: string): void {
    if (transaction.userId === approverId) {
      throw new ForbiddenException('Transaction initiator cannot approve their own transaction');
    }
  }

  private notify(userId: string, type: string, payload: Record<string, any>): void {
    this.notificationService
      .send({ type, userId, payload })
      .catch((err) => this.logger.error(`Notification failed: ${err.message}`));
  }
}
