import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ComplianceTransaction, TransactionStatus } from '../entities/compliance-transaction.entity';
import { ComplianceEvent, ComplianceEventType, ComplianceEventSeverity } from '../entities/compliance-event.entity';
import { UserFreeze } from '../entities/user-freeze.entity';

export interface ReviewDecision {
  transactionId: string;
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  reviewedBy: string;
  notes?: string;
  escalationReason?: string;
}

@Injectable()
export class ComplianceReviewService {
  constructor(
    @InjectRepository(ComplianceTransaction)
    private complianceTransactionRepository: Repository<ComplianceTransaction>,
    @InjectRepository(ComplianceEvent)
    private complianceEventRepository: Repository<ComplianceEvent>,
    @InjectRepository(UserFreeze)
    private userFreezeRepository: Repository<UserFreeze>,
  ) {}

  async reviewFlaggedTransaction(decision: ReviewDecision): Promise<void> {
    const { transactionId, decision: reviewDecision, reviewedBy, notes, escalationReason } = decision;

    const transaction = await this.complianceTransactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    let newStatus: TransactionStatus;
    let eventType: ComplianceEventType;
    let severity: ComplianceEventSeverity;
    let description: string;

    switch (reviewDecision) {
      case 'APPROVE':
        newStatus = TransactionStatus.COMPLETED;
        eventType = ComplianceEventType.COMPLIANCE_REVIEW;
        severity = ComplianceEventSeverity.MEDIUM;
        description = `Transaction approved by compliance review: ${notes || 'No notes'}`;
        break;

      case 'REJECT':
        newStatus = TransactionStatus.BLOCKED;
        eventType = ComplianceEventType.TRANSACTION_BLOCKED;
        severity = ComplianceEventSeverity.HIGH;
        description = `Transaction blocked by compliance review: ${notes || 'No notes'}`;
        break;

      case 'ESCALATE':
        newStatus = TransactionStatus.FLAGGED;
        eventType = ComplianceEventType.COMPLIANCE_REVIEW;
        severity = ComplianceEventSeverity.CRITICAL;
        description = `Transaction escalated for higher-level review: ${escalationReason || 'No reason provided'}`;
        break;

      default:
        throw new Error('Invalid review decision');
    }

    // Update transaction
    await this.complianceTransactionRepository.update(transactionId, {
      status: newStatus,
      reviewId: transactionId,
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: notes,
    });

    // Log compliance event
    await this.logComplianceEvent(
      transaction.userId,
      eventType,
      severity,
      description,
      {
        transactionId,
        decision: reviewDecision,
        reviewedBy,
        notes,
        escalationReason,
      },
      transactionId
    );

    // If transaction is blocked due to suspicious activity, consider account freeze
    if (reviewDecision === 'REJECT' && this.shouldFreezeAccount(transaction)) {
      await this.freezeUserAccount(transaction.userId, reviewedBy, 'Suspicious transaction blocked by compliance review');
    }
  }

  async getPendingReviews(): Promise<ComplianceTransaction[]> {
    return await this.complianceTransactionRepository.find({
      where: { status: TransactionStatus.FLAGGED },
      order: { createdAt: 'ASC' },
    });
  }

  async getReviewQueueStats(): Promise<{
    totalPending: number;
    highRisk: number;
    criticalRisk: number;
    oldestPending: Date | null;
  }> {
    const pendingTransactions = await this.complianceTransactionRepository.find({
      where: { status: TransactionStatus.FLAGGED },
      order: { createdAt: 'ASC' },
    });

    const highRisk = pendingTransactions.filter(t => t.riskScore >= 60).length;
    const criticalRisk = pendingTransactions.filter(t => t.riskScore >= 80).length;

    const oldestPending = pendingTransactions.length > 0 ? pendingTransactions[0].createdAt : null;

    return {
      totalPending: pendingTransactions.length,
      highRisk,
      criticalRisk,
      oldestPending,
    };
  }

  private shouldFreezeAccount(transaction: ComplianceTransaction): boolean {
    // Freeze account if multiple high-risk transactions from same user
    const riskFactors = transaction.riskFactors || [];
    const hasMultipleRiskFactors = riskFactors.length >= 3;

    // Check for patterns that warrant account freeze
    return (
      hasMultipleRiskFactors ||
      transaction.riskScore >= 90 ||
      riskFactors.some((f: any) => f.factor === 'SANCTIONS_HIT' || f.factor === 'PEP_HIT')
    );
  }

  private async freezeUserAccount(userId: string, frozenBy: string, reason: string): Promise<void> {
    const existingFreeze = await this.userFreezeRepository.findOne({
      where: { userId, status: 'ACTIVE' },
    });

    if (existingFreeze) {
      return; // Account already frozen
    }

    const freeze = this.userFreezeRepository.create({
      userId,
      reason: 'SUSPICIOUS_ACTIVITY',
      description: reason,
      frozenBy,
      frozenAt: new Date(),
      isPermanent: false,
    });

    await this.userFreezeRepository.save(freeze);
  }

  private async logComplianceEvent(
    userId: string,
    eventType: ComplianceEventType,
    severity: ComplianceEventSeverity,
    description: string,
    metadata?: any,
    transactionId?: string
  ): Promise<void> {
    const event = this.complianceEventRepository.create({
      userId,
      transactionId,
      eventType,
      severity,
      description,
      metadata,
      requiresAction: severity === ComplianceEventSeverity.HIGH || severity === ComplianceEventSeverity.CRITICAL,
    });

    await this.complianceEventRepository.save(event);
  }
}
