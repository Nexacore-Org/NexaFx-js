import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ApprovalService } from '../multi-signature-approval/approval.service';
import { ApprovalActionType } from '../multi-signature-approval/dto/approval.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, ILike, Repository, Between } from 'typeorm';
import { EntityManager, Repository, Between, Not } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { KycDocumentStatus } from '../kyc/kyc-document.entity';
import { SupportTicketEntity } from '../modules/support-tickets/entities/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';
import { AuditService } from '../audit/audit.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { TokenType } from '../auth/token-types';
import { TOKEN_VERSION_CHANGED_EVENT } from '../auth/token-version.service';
import { USER_ACCESS_CHANGED_EVENT, UserAccessChangedEvent } from '../auth/account-status.service';
import { CbnReportPeriod } from './dto/cbn-report-query.dto';

const ADMIN_SEARCH_LIMIT = 10;

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
export class AdminService implements OnModuleInit {
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
    private readonly auditService: AuditService,
    @Optional() private readonly approvalService?: ApprovalService,
    @Optional() private readonly events?: EventEmitter2,
    @Optional() private readonly jwtService?: JwtService,
    @Optional() private readonly rateService?: ExchangeRatesService,
  ) {}

  /** Tell the approval workflow how to run the actions this service owns. */
  onModuleInit(): void {
    this.approvalService?.registerHandler(
      ApprovalActionType.OVERRIDE_TRANSACTION_STATUS,
      (data, approvedBy, manager) =>
        this.overrideTransactionStatus(data.transactionId, data.newStatus, approvedBy, data.reason, manager),
    );
    this.approvalService?.registerHandler(
      ApprovalActionType.UPDATE_USER_STATUS,
      (data, approvedBy, manager) =>
        this.updateUserStatus(data.targetUserId, data.isActive, approvedBy, data.reason, manager),
    );
  }

  /** Four-eyes control for high-risk changes. Off unless ADMIN_DUAL_CONTROL=true. */
  isDualControlEnabled(): boolean {
    return process.env.ADMIN_DUAL_CONTROL === 'true';
  }

  /**
   * Platform search for support staff: users by email or name, transactions by
   * reference, hash or id. Each entity is capped so one query cannot dump a table.
   */
  async searchPlatform(query: string) {
    const term = (query ?? '').trim();
    const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);

    const [users, transactions] = await Promise.all([
      this.usersRepository.find({
        where: [{ email: ILike(pattern) }, { firstName: ILike(pattern) }, { lastName: ILike(pattern) }, ...(isUuid ? [{ id: term }] : [])],
        select: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'kycStatus'],
        take: ADMIN_SEARCH_LIMIT,
      }),
      this.transactionsRepository.find({
        where: [{ reference: ILike(pattern) }, { txHash: term }, ...(isUuid ? [{ id: term }] : [])],
        order: { createdAt: 'DESC' },
        take: ADMIN_SEARCH_LIMIT,
      }),
    ]);

    return { query: term, limit: ADMIN_SEARCH_LIMIT, results: { users, transactions } };
  }

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

  /** `[from, to)` UTC window for a CBN filing. */
  cbnReportWindow(
    period: CbnReportPeriod = 'monthly',
    periodStart?: string,
    now: Date = new Date(),
  ): { from: Date; to: Date } {
    const months = period === 'quarterly' ? 3 : 1;
    let from: Date;
    if (periodStart) {
      const parsed = new Date(periodStart);
      from = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    } else if (period === 'quarterly') {
      from = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
    } else {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()));
    return { from, to };
  }

  /**
   * Regulatory filing figures computed from the database for the requested
   * window. Volumes are converted to USD with the live rate from the exchange
   * rate service at generation time (the per-transaction execution rate is not
   * stored); currencies that cannot be converted are listed, never invented.
   */
  async generateCbnComplianceReport(period: CbnReportPeriod = 'monthly', periodStart?: string) {
    const { from, to } = this.cbnReportWindow(period, periodStart);

    const completed = await this.transactionsRepository
      .createQueryBuilder('tx')
      .select('tx.currency', 'currency')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(tx.amount)', 'volume')
      .where('tx.status = :status', { status: TransactionStatus.COMPLETED })
      .andWhere('COALESCE(tx.completedAt, tx.createdAt) >= :from', { from })
      .andWhere('COALESCE(tx.completedAt, tx.createdAt) < :to', { to })
      .groupBy('tx.currency')
      .getRawMany<{ currency: string; count: string; volume: string }>();

    const currencyBreakdown: Array<{
      currency: string;
      transactionCount: number;
      volume: number;
      usdRate: number | null;
      volumeUsd: number | null;
    }> = [];
    for (const row of completed) {
      const volume = Number(row.volume ?? 0);
      const usdRate = await this.usdRateFor(row.currency);
      currencyBreakdown.push({
        currency: row.currency,
        transactionCount: Number(row.count ?? 0),
        volume,
        usdRate,
        volumeUsd: usdRate === null ? null : Number((volume * usdRate).toFixed(2)),
      });
    }

    const unconvertedCurrencies = currencyBreakdown.filter((c) => c.usdRate === null).map((c) => c.currency);
    const totalTransactionVolumeUsd = Number(
      currencyBreakdown.reduce((sum, c) => sum + (c.volumeUsd ?? 0), 0).toFixed(2),
    );

    const flaggedAmlIncidents = await this.alertsRepository.count({
      where: { createdAt: Between(from, new Date(to.getTime() - 1)) } as any,
    });

    const kycRow = await this.kycRepository
      .createQueryBuilder('doc')
      .select('COUNT(DISTINCT doc.userId)', 'count')
      .where('doc.status = :approved', { approved: KycDocumentStatus.APPROVED })
      .andWhere('doc.reviewedAt < :to', { to })
      .getRawOne<{ count: string }>();

    return {
      reportType:
        period === 'quarterly' ? 'CBN_QUARTERLY_COMPLIANCE_FILING' : 'CBN_MONTHLY_COMPLIANCE_FILING',
      period,
      window: { from: from.toISOString(), to: to.toISOString() },
      generatedAt: new Date().toISOString(),
      metrics: {
        totalTransactionVolumeUsd,
        usdVolumeComplete: unconvertedCurrencies.length === 0,
        unconvertedCurrencies,
        totalTransactionsCount: currencyBreakdown.reduce((sum, c) => sum + c.transactionCount, 0),
        flaggedAmlIncidents,
        kycApprovedUsersCount: Number(kycRow?.count ?? 0),
      },
      currencyBreakdown,
    };
  }

  private async usdRateFor(currency: string): Promise<number | null> {
    if (currency.toUpperCase() === 'USD') return 1;
    if (!this.rateService) return null;
    try {
      const { rate } = await this.rateService.calculateConversion(currency, 'USD', 1);
      return Number.isFinite(rate) && rate > 0 ? rate : null;
    } catch {
      return null;
    }
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

    const parsedStart = startDate ? new Date(startDate) : undefined;
    const parsedEnd = endDate ? new Date(endDate) : undefined;
    if ((parsedStart && Number.isNaN(parsedStart.getTime())) || (parsedEnd && Number.isNaN(parsedEnd.getTime()))) {
      throw new BadRequestException('startDate and endDate must be valid ISO 8601 dates');
    }
    if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
      throw new BadRequestException('startDate must not be after endDate');
    }

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
    manager?: EntityManager,
  ): Promise<Transaction> {
    const transactionsRepo = manager ? manager.getRepository(Transaction) : this.transactionsRepository;
    const transaction = await transactionsRepo.findOne({
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
    const updated = await transactionsRepo.save(transaction);

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

  /** Run `fn` against the users repository inside one transaction (when a manager is available). */
  private async inUserTransaction<T>(fn: (repo: Repository<User>) => Promise<T>): Promise<T> {
    const manager = (this.usersRepository as unknown as { manager?: { transaction?: Function } }).manager;
    if (manager?.transaction) {
      return manager.transaction((m: { getRepository: (e: unknown) => Repository<User> }) =>
        fn(m.getRepository(User)),
      ) as Promise<T>;
    }
    return fn(this.usersRepository);
  }

  /**
   * Guardrails shared by role and status changes: an admin cannot act on
   * themselves, and the platform can never be left without an active admin.
   * The count runs inside the same transaction as the change.
   */
  private async assertPrivilegeChangeAllowed(
    repo: Repository<User>,
    target: User,
    actorId: string,
    removesActiveAdmin: boolean,
  ): Promise<void> {
    if (target.id === actorId) {
      throw new ForbiddenException('Admins cannot change their own role or status');
    }
    if (removesActiveAdmin && target.role === UserRole.ADMIN && target.isActive) {
      const otherAdmins = await repo.count({
        where: { role: UserRole.ADMIN, isActive: true, id: Not(target.id) },
      });
      if (otherAdmins === 0) {
        throw new ConflictException('Cannot remove the last active admin');
      }
    }
  }

  /**
   * Suspend or reactivate a user. Mirrors `updateUserRole`: runs in one transaction
   * (or the approval workflow's `manager`), applies the self-change and last-admin
   * guardrails, bumps `tokenVersion`, and announces the change so access tokens and
   * refresh tokens stop working immediately when the user is suspended (issue #1518).
   */
  async updateUserStatus(
    targetUserId: string,
    isActive: boolean,
    adminUserId: string,
    reason?: string,
    manager?: EntityManager,
  ): Promise<User> {
    const work = async (repo: Repository<User>) => {
      const user = await repo.findOne({ where: { id: targetUserId } });
      if (!user) {
        throw new NotFoundException(`User ${targetUserId} not found`);
      }
      await this.assertPrivilegeChangeAllowed(repo, user, adminUserId, !isActive);

      const snapshot = {
        isActive: user.isActive,
        role: user.role,
        kycStatus: user.kycStatus,
        email: user.email,
      };
      user.isActive = isActive;
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      return { before: snapshot, updated: await repo.save(user) };
    };

    const { before, updated } = manager
      ? await work(manager.getRepository(User))
      : await this.inUserTransaction(work);

    this.events?.emit(TOKEN_VERSION_CHANGED_EVENT, { userId: targetUserId });
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
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A reason of at least 5 characters is required for role changes');
    }

    const { before, updated } = await this.inUserTransaction(async (repo) => {
      const user = await repo.findOne({ where: { id: targetUserId } });
      if (!user) {
        throw new NotFoundException(`User ${targetUserId} not found`);
      }
      await this.assertPrivilegeChangeAllowed(repo, user, adminUserId, newRole !== UserRole.ADMIN);

      const snapshot = {
        isActive: user.isActive,
        role: user.role,
        kycStatus: user.kycStatus,
        email: user.email,
      };
      user.role = newRole;
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      return { before: snapshot, updated: await repo.save(user) };
    });

    this.events?.emit(TOKEN_VERSION_CHANGED_EVENT, { userId: targetUserId });

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

  /** Lifetime of an impersonation session; there is no revoke endpoint, the TTL is the limit. */
  static readonly IMPERSONATION_TTL = '15m';

  /**
   * Start a read-only, 15-minute impersonation session. The returned JWT is an
   * ordinary access token for the target (`sub`) that also carries the real
   * admin as the RFC 8693 actor (`act.sub`) and `impersonation: true`;
   * `ImpersonationGuard` then refuses every state-changing request made with it.
   */
  async impersonateUser(targetUserId: string, adminUserId: string, reason: string) {
    if (!adminUserId) {
      throw new ForbiddenException('An authenticated admin is required');
    }
    if (!this.jwtService) {
      throw new ForbiddenException('Impersonation is not available');
    }

    const user = await this.usersRepository.findOne({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException(`User ${targetUserId} not found`);
    if (user.role === UserRole.ADMIN || user.role === UserRole.COMPLIANCE) {
      throw new ForbiddenException('Admin and compliance accounts cannot be impersonated');
    }

    const token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        typ: TokenType.ACCESS,
        // Without `tv` TokenVersionGuard would reject this token as stale.
        tv: user.tokenVersion ?? 0,
        act: { sub: adminUserId },
        impersonation: true,
      },
      { expiresIn: AdminService.IMPERSONATION_TTL },
    );

    await this.auditService.log({
      userId: adminUserId,
      action: 'admin.user.impersonate',
      entityType: 'user',
      entityId: targetUserId,
      after: { impersonatedUserId: targetUserId, impersonatedEmail: user.email, ttl: AdminService.IMPERSONATION_TTL },
      reason,
    });

    return {
      impersonatedUserId: user.id,
      email: user.email,
      impersonatedBy: adminUserId,
      readOnly: true,
      expiresIn: AdminService.IMPERSONATION_TTL,
      token,
    };
  }
}
