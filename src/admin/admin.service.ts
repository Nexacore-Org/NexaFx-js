import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { KycDocumentStatus } from '../kyc/kyc-document.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';
import { AuditService } from '../audit/audit.service';

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
    @InjectRepository(SupportTicket)
    private readonly supportTicketsRepository: Repository<SupportTicket>,
    @InjectRepository(WebhookEndpoint)
    private readonly webhooksRepository: Repository<WebhookEndpoint>,
    @InjectRepository(AmlAlert)
    private readonly alertsRepository: Repository<AmlAlert>,
    private readonly auditService: AuditService,
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
}
