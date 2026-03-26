import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../entities/wallet.entity';
import { AdminAuditLogEntity } from '../../admin-audit/entities/admin-audit-log.entity';
import { DeviceEntity } from '../../sessions/entities/device.entity';
import { ComplianceReport } from '../../../compliance-evidence/compliance-report.entity';

export interface ActivityEvent {
  eventId: string;
  eventType:
    | 'TRANSACTION'
    | 'WALLET'
    | 'AUDIT_LOG'
    | 'DEVICE_SESSION'
    | 'COMPLIANCE';
  summary: string;
  metadata: Record<string, any>;
  occurredAt: Date;
}

@Injectable()
export class ActivityTimelineService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,

    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,

    @InjectRepository(AdminAuditLogEntity)
    private readonly auditRepo: Repository<AdminAuditLogEntity>,

    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,

    @InjectRepository(ComplianceReport)
    private readonly complianceRepo: Repository<ComplianceReport>,
  ) {}

  async getTimeline(
    userId: string,
    opts: { cursor?: string; limit?: number; adminView?: boolean },
  ): Promise<{
    events: ActivityEvent[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(opts.limit ?? 20, 100);
    const before = opts.cursor ? new Date(opts.cursor) : new Date();

    const [txEvents, walletEvents, auditEvents, deviceEvents, complianceEvents] =
      await Promise.all([
        this.fetchTransactionEvents(userId, before, limit),
        this.fetchWalletEvents(userId, before, limit),
        this.fetchAuditEvents(userId, before, limit, opts.adminView),
        this.fetchDeviceEvents(userId, before, limit),
        this.fetchComplianceEvents(userId, before, limit),
      ]);

    const all: ActivityEvent[] = [
      ...txEvents,
      ...walletEvents,
      ...auditEvents,
      ...deviceEvents,
      ...complianceEvents,
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);

    const nextCursor =
      all.length === limit
        ? all[all.length - 1].occurredAt.toISOString()
        : null;

    return { events: all, nextCursor, hasMore: nextCursor !== null };
  }

  private async fetchTransactionEvents(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<ActivityEvent[]> {
    const wallets = await this.walletRepo.find({
      where: { userId },
      select: ['id'],
      withDeleted: true,
    });
    const walletIds = wallets.map((w) => w.id);
    if (!walletIds.length) return [];

    const txs = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.walletId IN (:...walletIds)', { walletIds })
      .andWhere('tx.createdAt < :before', { before })
      .orderBy('tx.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return txs.map((tx) => ({
      eventId: tx.id,
      eventType: 'TRANSACTION' as const,
      summary: `Transaction ${tx.status}: ${tx.amount} ${tx.currency}`,
      metadata: {
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        walletId: tx.walletId,
      },
      occurredAt: tx.createdAt,
    }));
  }

  private async fetchWalletEvents(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<ActivityEvent[]> {
    const wallets = await this.walletRepo
      .createQueryBuilder('w')
      .where('w.userId = :userId', { userId })
      .andWhere('w.createdAt < :before', { before })
      .orderBy('w.createdAt', 'DESC')
      .take(limit)
      .withDeleted()
      .getMany();

    return wallets.map((w) => ({
      eventId: w.id,
      eventType: 'WALLET' as const,
      summary: `Wallet ${w.deletedAt ? 'deactivated' : 'created'}: ${w.name}`,
      metadata: { walletId: w.id, name: w.name, status: w.status },
      occurredAt: w.deletedAt ?? w.createdAt,
    }));
  }

  private async fetchAuditEvents(
    userId: string,
    before: Date,
    limit: number,
    adminView?: boolean,
  ): Promise<ActivityEvent[]> {
    const qb = this.auditRepo
      .createQueryBuilder('log')
      .where('log.actorId = :userId', { userId })
      .andWhere('log.createdAt < :before', { before })
      .orderBy('log.createdAt', 'DESC')
      .take(limit);

    if (!adminView) {
      // Regular users only see their own user-scoped actions
      qb.andWhere("log.actorType = 'user'");
    }

    const logs = await qb.getMany();

    return logs.map((log) => ({
      eventId: log.id,
      eventType: 'AUDIT_LOG' as const,
      summary: log.description ?? log.action,
      metadata: {
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
      },
      occurredAt: log.createdAt,
    }));
  }

  private async fetchDeviceEvents(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<ActivityEvent[]> {
    const devices = await this.deviceRepo
      .createQueryBuilder('d')
      .where('d.userId = :userId', { userId })
      .andWhere('d.lastLoginAt < :before', { before })
      .orderBy('d.lastLoginAt', 'DESC')
      .take(limit)
      .getMany();

    return devices.map((d) => ({
      eventId: d.id,
      eventType: 'DEVICE_SESSION' as const,
      summary: `Login from ${d.deviceName ?? d.platform ?? 'unknown device'}`,
      metadata: {
        deviceKey: d.deviceKey,
        platform: d.platform,
        browser: d.browser,
        lastIp: d.lastIp,
        lastCountry: d.lastCountry,
      },
      occurredAt: d.lastLoginAt ?? d.createdAt,
    }));
  }

  private async fetchComplianceEvents(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<ActivityEvent[]> {
    const reports = await this.complianceRepo
      .createQueryBuilder('r')
      .where('r.requestedBy = :userId', { userId })
      .andWhere('r.createdAt < :before', { before })
      .orderBy('r.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return reports.map((r) => ({
      eventId: r.id,
      eventType: 'COMPLIANCE' as const,
      summary: `Compliance report: ${r.reportType} (${r.status})`,
      metadata: { reportType: r.reportType, status: r.status },
      occurredAt: r.createdAt,
    }));
  }
}
