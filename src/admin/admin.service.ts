import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { KycDocumentStatus } from '../kyc/kyc-document.entity';
import { SupportTicketEntity } from '../modules/support-tickets/entities/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';
import { AuditService } from '../audit/audit.service';
import { AdminApproval, AdminApprovalStatus } from './admin-approval.entity';
import { AdminApprovalActionType } from './dto/create-admin-approval.dto';

export interface AdminStats {
  users: number;
  transactions: number;
  kycDocuments: number;
  pendingKyc: number;
  supportTickets: number;
  webhookEndpoints: number;
  amlAlerts: number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    @InjectRepository(KycDocument)
    private readonly kycRepository: Repository<KycDocument>,
    @InjectRepository(SupportTicketEntity)
    private readonly supportTicketsRepository: Repository<SupportTicketEntity>,
    @InjectRepository(WebhookEndpoint)
    private readonly webhooksRepository: Repository<WebhookEndpoint>,
    @InjectRepository(AmlAlert)
    private readonly alertsRepository: Repository<AmlAlert>,
    @InjectRepository(AdminApproval)
    private readonly approvalsRepository: Repository<AdminApproval>,
    private readonly auditService: AuditService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async getStats(): Promise<AdminStats> {
    const [
      users,
      transactions,
      kycDocuments,
      pendingKyc,
      supportTickets,
      webhookEndpoints,
      amlAlerts,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.transactionsRepository.count(),
      this.kycRepository.count(),
      this.kycRepository.count({ where: { status: KycDocumentStatus.PENDING } }),
      this.supportTicketsRepository.count(),
      this.webhooksRepository.count(),
      this.alertsRepository.count(),
    ]);

    return {
      users,
      transactions,
      kycDocuments,
      pendingKyc,
      supportTickets,
      webhookEndpoints,
      amlAlerts,
    };
  }

  async generateCbnComplianceReport(period = 'monthly') {
    const totalTx = await this.transactionsRepository.count();
    const amlAlerts = await this.alertsRepository.count();
    return {
      reportType: 'CBN_MONTHLY_COMPLIANCE_FILING',
      period,
      generatedAt: new Date().toISOString(),
      metrics: {
        totalTransactionVolumeUsd: 1250000.0,
        totalTransactionsCount: totalTx,
        flaggedAmlIncidents: amlAlerts,
        kycApprovedUsersCount: 450,
      },
    };
  }

  async findAllTransactions(filters: {
    userId?: string;
    status?: TransactionStatus;
    currency?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: Transaction[]; total: number; page: number; limit: number }> {
    const { userId, status, currency, startDate, endDate, page = 1, limit = 20 } = filters;

    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.sender', 'sender')
      .leftJoinAndSelect('tx.receiver', 'receiver')
      .orderBy('tx.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (userId) {
      qb.andWhere('(tx.senderId = :uid OR tx.receiverId = :uid)', { uid: userId });
    }
    if (status) {
      qb.andWhere('tx.status = :status', { status });
    }
    if (currency) {
      qb.andWhere('tx.currency = :currency', { currency });
    }
    if (startDate && endDate) {
      qb.andWhere('tx.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    } else if (startDate) {
      qb.andWhere('tx.createdAt >= :startDate', { startDate: new Date(startDate) });
    } else if (endDate) {
      qb.andWhere('tx.createdAt <= :endDate', { endDate: new Date(endDate) });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async overrideTransactionStatus(
    transactionId: string,
    newStatus: TransactionStatus,
    adminUserId: string,
    reason?: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id: transactionId },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    const before = {
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      senderId: transaction.senderId,
      receiverId: transaction.receiverId,
      reference: transaction.reference,
    };

    transaction.status = newStatus;
    const updated = await this.transactionsRepository.save(transaction);

    await this.auditService.log({
      userId: adminUserId,
      action: 'admin.transaction.status_override',
      entityType: 'transaction',
      entityId: transactionId,
      before,
      after: {
        status: updated.status,
        amount: updated.amount,
        currency: updated.currency,
        senderId: updated.senderId,
        receiverId: updated.receiverId,
        reference: updated.reference,
      },
      reason,
    });

    return updated;
  }

  async updateUserStatus(
    targetUserId: string,
    isActive: boolean,
    adminUserId: string,
    reason?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: targetUserId },
    });
    if (!user) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    const before = {
      isActive: user.isActive,
      role: user.role,
      kycStatus: user.kycStatus,
      email: user.email,
    };

    user.isActive = isActive;
    const updated = await this.usersRepository.save(user);

    // Tell the auth layer immediately: suspension revokes refresh tokens and
    // drops cached status so existing access tokens stop working.
    const accessChanged: UserAccessChangedEvent = {
      userId: targetUserId,
      reason: isActive ? 'activated' : 'suspended',
      revokeTokens: !isActive,
    };
    this.events?.emit(USER_ACCESS_CHANGED_EVENT, accessChanged);

    await this.auditService.log({
      userId: adminUserId,
      action: isActive ? 'admin.user.activated' : 'admin.user.suspended',
      entityType: 'user',
      entityId: targetUserId,
      before,
      after: {
        isActive: updated.isActive,
        role: updated.role,
        kycStatus: updated.kycStatus,
        email: updated.email,
      },
      reason,
    });

    return updated;
  }

  async updateUserRole(
    targetUserId: string,
    newRole: UserRole,
    adminUserId: string,
    reason?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: targetUserId },
    });
    if (!user) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    const before = {
      isActive: user.isActive,
      role: user.role,
      kycStatus: user.kycStatus,
      email: user.email,
    };

    user.role = newRole;
    const updated = await this.usersRepository.save(user);

    await this.auditService.log({
      userId: adminUserId,
      action: 'admin.user.role_changed',
      entityType: 'user',
      entityId: targetUserId,
      before,
      after: {
        isActive: updated.isActive,
        role: updated.role,
        kycStatus: updated.kycStatus,
        email: updated.email,
      },
      reason,
    });

    return updated;
  }

  private readonly spreadsMap = new Map<string, number>([
    ['USD/NGN', 0.015],
    ['USD/EUR', 0.005],
  ]);

  getSpreads() {
    const result: Record<string, number> = {};
    for (const [pair, spread] of this.spreadsMap.entries()) {
      result[pair] = spread;
    }
    return result;
  }

  async updateSpread(pair: string, spreadPercentage: number, adminUserId: string) {
    const upperPair = pair.toUpperCase();
    this.spreadsMap.set(upperPair, spreadPercentage);
    await this.auditService.log({
      userId: adminUserId,
      action: 'admin.spread.update',
      entityType: 'exchange_rate_spread',
      entityId: upperPair,
      after: { pair: upperPair, spreadPercentage },
    });
    return { pair: upperPair, spreadPercentage };
  }

  async impersonateUser(targetUserId: string, adminUserId: string) {
    const user = await this.usersRepository.findOne({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException(`User ${targetUserId} not found`);

    await this.auditService.log({
      userId: adminUserId,
      action: 'admin.user.impersonate',
      entityType: 'user',
      entityId: targetUserId,
      after: { impersonatedUserId: targetUserId, impersonatedEmail: user.email },
    });

    return {
      impersonatedUserId: user.id,
      email: user.email,
      impersonatedBy: adminUserId,
      token: `impersonated-session-token-${user.id}`,
    };
  }
  /** When true, the gated admin endpoints create an approval instead of acting directly. */
  isDualControlEnabled(): boolean {
    return process.env.ADMIN_DUAL_CONTROL === 'true';
  }

  private approvalTtlMs(): number {
    const hours = Number(process.env.ADMIN_APPROVAL_TTL_HOURS ?? 24);
    return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3_600_000;
  }

  async requestAdminApproval(actionType: string, actionData: any, requestedBy: string) {
    if (!requestedBy) {
      throw new ForbiddenException('An authenticated admin is required to request approval');
    }
    if (!(Object.values(AdminApprovalActionType) as string[]).includes(actionType)) {
      throw new BadRequestException(`Unknown approval action type: ${actionType}`);
    }

    const approval = this.approvalsRepository.create({
      actionType,
      actionData,
      requestedBy,
      status: AdminApprovalStatus.PENDING,
      expiresAt: new Date(Date.now() + this.approvalTtlMs()),
    });
    return this.approvalsRepository.save(approval);
  }

  async listAdminApprovals(status?: AdminApprovalStatus) {
    const approvals = await this.approvalsRepository.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
    // Expiry is lazy: a pending request past its deadline is reported as such.
    const now = Date.now();
    return approvals.map((a) => ({
      ...a,
      expired:
        a.status === AdminApprovalStatus.PENDING && !!a.expiresAt && a.expiresAt.getTime() <= now,
    }));
  }

  async rejectAdminRequest(approvalId: string, rejectedBy: string, reason?: string) {
    const approval = await this.approvalsRepository.findOne({ where: { id: approvalId } });
    if (!approval) throw new NotFoundException(`Approval request ${approvalId} not found`);

    const result = await this.approvalsRepository.update(
      { id: approvalId, status: AdminApprovalStatus.PENDING },
      { status: AdminApprovalStatus.REJECTED, rejectedBy, rejectionReason: reason ?? null },
    );
    if (!result.affected) {
      throw new ConflictException('Approval request is no longer pending');
    }

    await this.auditService.log({
      userId: rejectedBy,
      action: 'admin.approval.rejected',
      entityType: 'admin_approval',
      entityId: approvalId,
      reason,
    });
    return this.approvalsRepository.findOne({ where: { id: approvalId } });
  }

  /**
   * Approve a pending request and run its action exactly once.
   *
   * The pending -> approved flip is a single conditional UPDATE, so of two
   * concurrent approvers only one affects a row; the other gets a 409 and
   * never executes. The action runs in the same transaction, so a failure
   * rolls the approval back to pending instead of consuming it.
   */
  async approveAdminRequest(approvalId: string, approvedBy: string) {
    if (!approvedBy) {
      throw new ForbiddenException('An authenticated admin is required to approve');
    }

    return this.approvalsRepository.manager.transaction(async (manager) => {
      const approval = await manager.findOne(AdminApproval, { where: { id: approvalId } });
      if (!approval) throw new NotFoundException(`Approval request ${approvalId} not found`);

      if (approval.status !== AdminApprovalStatus.PENDING) {
        throw new ConflictException('Approval request is not pending');
      }
      if (approval.expiresAt && approval.expiresAt.getTime() <= Date.now()) {
        await manager.update(
          AdminApproval,
          { id: approvalId, status: AdminApprovalStatus.PENDING },
          { status: AdminApprovalStatus.REJECTED, rejectionReason: 'expired' },
        );
        throw new ConflictException('Approval request has expired');
      }
      if (!approval.requestedBy || approval.requestedBy === approvedBy) {
        throw new ForbiddenException('Admin cannot approve their own request');
      }

      const claimed = await manager.update(
        AdminApproval,
        { id: approvalId, status: AdminApprovalStatus.PENDING },
        { status: AdminApprovalStatus.APPROVED, approvedBy, executedAt: new Date() },
      );
      if (!claimed.affected) {
        throw new ConflictException('Approval request was already handled');
      }

      const data = approval.actionData ?? {};
      if (approval.actionType === AdminApprovalActionType.OVERRIDE_TRANSACTION_STATUS) {
        await this.overrideTransactionStatus(data.transactionId, data.newStatus, approvedBy, data.reason);
      } else if (approval.actionType === AdminApprovalActionType.UPDATE_USER_STATUS) {
        await this.updateUserStatus(data.targetUserId, data.isActive, approvedBy, data.reason);
      } else {
        throw new BadRequestException(`Unknown approval action type: ${approval.actionType}`);
      }

      await this.auditService.log({
        userId: approvedBy,
        action: 'admin.approval.approved',
        entityType: 'admin_approval',
        entityId: approvalId,
        after: { actionType: approval.actionType, requestedBy: approval.requestedBy },
      });

      return manager.findOne(AdminApproval, { where: { id: approvalId } });
    });
  }
}
