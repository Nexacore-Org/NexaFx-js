import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlagEntity } from '../../feature-flags/entities/feature-flag.entity';
import { DeviceEntity } from '../../sessions/entities/device.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WebhookDeliveryEntity } from '../../webhooks/entities/webhook-delivery.entity';
import { ComplianceReport } from '../../../compliance-evidence/compliance-report.entity';
import { ReportStatus } from '../../../compliance-evidence/report-type.enum';
import { RpcHealthLogEntity } from '../../rpc-health/entities/rpc-health-log.entity';
import {
  DashboardAlertDto,
  DashboardResponseDto,
  QuickActionDto,
  DashboardAlertSeverity,
} from '../dto/dashboard-response.dto';
import { NotificationsGateway } from '../../../web-sockets/notifications.gateway';

type DashboardCacheEntry = {
  dashboard: DashboardResponseDto;
  alerts: DashboardAlertDto[];
  expiresAt: number;
};

type CircuitBreakerStatus = 'closed' | 'half_open' | 'open';

const DASHBOARD_CACHE_TTL_MS = 10_000;
const ACTIVE_SESSION_WINDOW_MINUTES = 30;
const HIGH_RISK_THRESHOLD = 70;
const HIGH_RISK_WINDOW_HOURS = 24;
const WEBHOOK_FAILURE_WINDOW_HOURS = 24;
const ALERT_SEVERITY_RANK: Record<DashboardAlertSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private cache: DashboardCacheEntry | null = null;
  private refreshPromise: Promise<DashboardCacheEntry> | null = null;
  private activeAlertIds = new Set<string>();

  constructor(
    private readonly moduleRef: ModuleRef,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly webhookDeliveryRepo: Repository<WebhookDeliveryEntity>,
    @InjectRepository(ComplianceReport)
    private readonly complianceReportRepo: Repository<ComplianceReport>,
    @InjectRepository(FeatureFlagEntity)
    private readonly featureFlagRepo: Repository<FeatureFlagEntity>,
    @InjectRepository(RpcHealthLogEntity)
    private readonly rpcHealthLogRepo: Repository<RpcHealthLogEntity>,
  ) {}

  async getDashboard(): Promise<DashboardResponseDto> {
    const cached = await this.getOrRefreshCache();
    return cached.dashboard;
  }

  async getActiveAlerts(): Promise<DashboardAlertDto[]> {
    const cached = await this.getOrRefreshCache();
    return cached.alerts;
  }

  async invalidateCache(): Promise<void> {
    this.cache = null;
  }

  private async getOrRefreshCache(): Promise<DashboardCacheEntry> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.buildCacheEntry().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async buildCacheEntry(): Promise<DashboardCacheEntry> {
    const generatedAt = new Date().toISOString();

    const [
      systemHealth,
      activeSessions,
      recentHighRiskTransactions,
      complianceCaseBacklog,
      pendingMultisigApprovals,
      recentWebhookFailures,
      maintenanceStatus,
    ] = await Promise.all([
      this.buildSystemHealthSection(),
      this.buildActiveSessionsSection(),
      this.buildRecentHighRiskTransactionsSection(),
      this.buildComplianceBacklogSection(),
      this.buildPendingMultisigApprovalsSection(),
      this.buildRecentWebhookFailuresSection(),
      this.buildMaintenanceStatusSection(),
    ]);

    const quickActions = this.buildQuickActions({
      systemHealth,
      recentHighRiskTransactions,
      complianceCaseBacklog,
      pendingMultisigApprovals,
      recentWebhookFailures,
      maintenanceStatus,
    });

    const dashboard: DashboardResponseDto = {
      generatedAt,
      cacheTtlSeconds: DASHBOARD_CACHE_TTL_MS / 1000,
      systemHealth,
      activeSessions,
      recentHighRiskTransactions,
      complianceCaseBacklog,
      pendingMultisigApprovals,
      recentWebhookFailures,
      maintenanceStatus,
      quickActions,
    };

    const alerts = this.sortAlerts(this.buildAlerts(dashboard));
    await this.emitNewAlerts(alerts);

    const entry: DashboardCacheEntry = {
      dashboard,
      alerts,
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    };

    this.cache = entry;
    return entry;
  }

  private async buildSystemHealthSection(): Promise<DashboardResponseDto['systemHealth']> {
    const rows = await this.rpcHealthLogRepo
      .createQueryBuilder('rpc')
      .orderBy('rpc.createdAt', 'DESC')
      .take(50)
      .getMany();

    const latestBySource = new Map<string, RpcHealthLogEntity>();
    for (const row of rows) {
      const key = `${row.network}:${row.providerUrl}`;
      if (!latestBySource.has(key)) {
        latestBySource.set(key, row);
      }
    }

    const circuitBreakers = Array.from(latestBySource.values()).map((row) => ({
      name: row.network,
      source: row.providerUrl,
      state: this.mapHealthToCircuitBreakerState(row.status),
      lastStatus: row.status,
      latencyMs: row.latencyMs ?? null,
      checkedAt: row.createdAt?.toISOString?.() ?? null,
    }));

    const hasOpenBreaker = circuitBreakers.some((item) => item.state === 'open');
    const hasHalfOpenBreaker = circuitBreakers.some(
      (item) => item.state === 'half_open',
    );

    return {
      status: hasOpenBreaker
        ? 'unhealthy'
        : hasHalfOpenBreaker
          ? 'degraded'
          : 'healthy',
      checkedAt: new Date().toISOString(),
      circuitBreakers,
    };
  }

  private async buildActiveSessionsSection(): Promise<DashboardResponseDto['activeSessions']> {
    const cutoff = new Date(Date.now() - ACTIVE_SESSION_WINDOW_MINUTES * 60_000);
    const count = await this.deviceRepo
      .createQueryBuilder('device')
      .where('device.lastLoginAt IS NOT NULL')
      .andWhere('device.lastLoginAt >= :cutoff', { cutoff })
      .getCount();

    return {
      count,
      windowMinutes: ACTIVE_SESSION_WINDOW_MINUTES,
    };
  }

  private async buildRecentHighRiskTransactionsSection(): Promise<
    DashboardResponseDto['recentHighRiskTransactions']
  > {
    const since = new Date(Date.now() - HIGH_RISK_WINDOW_HOURS * 60 * 60_000);
    const query = this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.createdAt >= :since', { since })
      .andWhere('tx.riskScore > :threshold', { threshold: HIGH_RISK_THRESHOLD })
      .orderBy('tx.riskScore', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC');

    const [items, count] = await Promise.all([query.take(10).getMany(), query.getCount()]);

    return {
      count,
      threshold: HIGH_RISK_THRESHOLD,
      timeWindowHours: HIGH_RISK_WINDOW_HOURS,
      items: items.map((item) => ({
        id: item.id,
        amount: Number(item.amount),
        currency: item.currency,
        status: item.status,
        riskScore: item.riskScore,
        createdAt: item.createdAt.toISOString(),
        walletId: item.walletId ?? null,
      })),
    };
  }

  private async buildComplianceBacklogSection(): Promise<
    DashboardResponseDto['complianceCaseBacklog']
  > {
    const [pending, processing, failed, oldestPending] = await Promise.all([
      this.complianceReportRepo.count({ where: { status: ReportStatus.PENDING } }),
      this.complianceReportRepo.count({ where: { status: ReportStatus.PROCESSING } }),
      this.complianceReportRepo.count({ where: { status: ReportStatus.FAILED } }),
      this.complianceReportRepo.findOne({
        where: { status: ReportStatus.PENDING },
        order: { createdAt: 'ASC' },
      }),
    ]);

    return {
      pending,
      processing,
      failed,
      total: pending + processing + failed,
      oldestPendingAt: oldestPending?.createdAt?.toISOString() ?? null,
    };
  }

  private async buildPendingMultisigApprovalsSection(): Promise<
    DashboardResponseDto['pendingMultisigApprovals']
  > {
    const [items, rawCount] = await Promise.all([
      this.transactionRepo
        .createQueryBuilder('tx')
        .where('tx.status = :status', { status: 'PENDING_APPROVAL' })
        .orderBy('tx.createdAt', 'ASC')
        .take(10)
        .getRawMany<{
          tx_id: string;
          tx_amount: string;
          tx_currency: string;
          tx_status: string;
          tx_createdAt: Date;
          tx_requiredApprovals?: number;
          tx_currentApprovals?: number;
        }>(),
      this.transactionRepo
        .createQueryBuilder('tx')
        .where('tx.status = :status', { status: 'PENDING_APPROVAL' })
        .getCount(),
    ]);

    return {
      count: rawCount,
      items: items.map((item) => ({
        id: item.tx_id,
        amount: Number(item.tx_amount),
        currency: item.tx_currency,
        status: item.tx_status,
        createdAt: new Date(item.tx_createdAt).toISOString(),
        requiredApprovals: item.tx_requiredApprovals ?? null,
        currentApprovals: item.tx_currentApprovals ?? null,
      })),
    };
  }

  private async buildRecentWebhookFailuresSection(): Promise<
    DashboardResponseDto['recentWebhookFailures']
  > {
    const since = new Date(Date.now() - WEBHOOK_FAILURE_WINDOW_HOURS * 60 * 60_000);
    const [items, last24HoursCount] = await Promise.all([
      this.webhookDeliveryRepo.find({
        where: { status: 'failed' },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.webhookDeliveryRepo
        .createQueryBuilder('delivery')
        .where('delivery.status = :status', { status: 'failed' })
        .andWhere('delivery.createdAt >= :since', { since })
        .getCount(),
    ]);

    return {
      count: items.length,
      last24HoursCount,
      items: items.map((item) => ({
        id: item.id,
        eventName: item.eventName,
        subscriptionId: item.subscriptionId,
        attempts: item.attempts,
        lastHttpStatus: item.lastHttpStatus ?? null,
        lastError: item.lastError ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private async buildMaintenanceStatusSection(): Promise<
    DashboardResponseDto['maintenanceStatus']
  > {
    const flags = await this.featureFlagRepo
      .createQueryBuilder('flag')
      .where('LOWER(flag.name) LIKE :pattern', { pattern: '%maintenance%' })
      .orderBy('flag.updatedAt', 'DESC')
      .getMany();

    return {
      active: flags.some((flag) => flag.enabled),
      flags: flags.filter((flag) => flag.enabled).map((flag) => flag.name),
      updatedAt: flags[0]?.updatedAt?.toISOString() ?? null,
    };
  }

  private buildQuickActions(input: {
    systemHealth: DashboardResponseDto['systemHealth'];
    recentHighRiskTransactions: DashboardResponseDto['recentHighRiskTransactions'];
    complianceCaseBacklog: DashboardResponseDto['complianceCaseBacklog'];
    pendingMultisigApprovals: DashboardResponseDto['pendingMultisigApprovals'];
    recentWebhookFailures: DashboardResponseDto['recentWebhookFailures'];
    maintenanceStatus: DashboardResponseDto['maintenanceStatus'];
  }): QuickActionDto[] {
    const actions: QuickActionDto[] = [
      {
        id: 'review-high-risk-transactions',
        label: 'Review High-Risk Transactions',
        action: '/admin/transactions?riskScoreGt=70',
        enabled: input.recentHighRiskTransactions.count > 0,
        priority: 100,
        reason:
          input.recentHighRiskTransactions.count > 0
            ? `${input.recentHighRiskTransactions.count} transaction(s) need review`
            : 'No high-risk transactions pending',
      },
      {
        id: 'process-compliance-backlog',
        label: 'Process Compliance Backlog',
        action: '/compliance/reports?status=pending',
        enabled: input.complianceCaseBacklog.pending > 0,
        priority: 90,
        reason:
          input.complianceCaseBacklog.pending > 0
            ? `${input.complianceCaseBacklog.pending} compliance case(s) pending`
            : 'No pending compliance cases',
      },
      {
        id: 'approve-multisig',
        label: 'Review Multi-Sig Approvals',
        action: '/transactions/pending-approvals',
        enabled: input.pendingMultisigApprovals.count > 0,
        priority: 80,
        reason:
          input.pendingMultisigApprovals.count > 0
            ? `${input.pendingMultisigApprovals.count} approval(s) waiting`
            : 'No pending approvals',
      },
      {
        id: 'retry-webhooks',
        label: 'Investigate Webhook Failures',
        action: '/admin/webhooks/failures',
        enabled: input.recentWebhookFailures.last24HoursCount > 0,
        priority: 70,
        reason:
          input.recentWebhookFailures.last24HoursCount > 0
            ? `${input.recentWebhookFailures.last24HoursCount} webhook failure(s) in 24h`
            : 'No recent webhook failures',
      },
      {
        id: 'manage-maintenance',
        label: 'Manage Maintenance Mode',
        action: '/admin/feature-flags',
        enabled: true,
        priority: input.maintenanceStatus.active ? 60 : 10,
        reason: input.maintenanceStatus.active
          ? 'Maintenance mode is currently enabled'
          : 'Maintenance mode is currently disabled',
      },
      {
        id: 'inspect-circuit-breakers',
        label: 'Inspect Circuit Breakers',
        action: '/admin/rpc-health',
        enabled: input.systemHealth.status !== 'healthy',
        priority: input.systemHealth.status === 'unhealthy' ? 95 : 50,
        reason:
          input.systemHealth.status === 'healthy'
            ? 'All circuit breakers are healthy'
            : `System health is ${input.systemHealth.status}`,
      },
    ];

    return actions.sort((a, b) => b.priority - a.priority);
  }

  private buildAlerts(dashboard: DashboardResponseDto): DashboardAlertDto[] {
    const alerts: DashboardAlertDto[] = [];
    const createdAt = dashboard.generatedAt;

    if (dashboard.systemHealth.status === 'unhealthy') {
      alerts.push({
        id: 'system-health-unhealthy',
        severity: 'critical',
        title: 'System Health Degraded',
        message: 'One or more circuit breakers are open.',
        source: 'system-health',
        createdAt,
        action: '/admin/rpc-health',
      });
    } else if (dashboard.systemHealth.status === 'degraded') {
      alerts.push({
        id: 'system-health-degraded',
        severity: 'high',
        title: 'System Health Warning',
        message: 'At least one circuit breaker is half-open.',
        source: 'system-health',
        createdAt,
        action: '/admin/rpc-health',
      });
    }

    if (dashboard.recentHighRiskTransactions.count > 0) {
      alerts.push({
        id: 'high-risk-transactions-present',
        severity: 'high',
        title: 'High-Risk Transactions Require Review',
        message: `${dashboard.recentHighRiskTransactions.count} high-risk transaction(s) detected in the last 24 hours.`,
        source: 'transactions',
        createdAt,
        action: '/admin/transactions?riskScoreGt=70',
        metadata: { count: dashboard.recentHighRiskTransactions.count },
      });
    }

    if (dashboard.complianceCaseBacklog.pending > 0) {
      alerts.push({
        id: 'compliance-backlog-pending',
        severity: 'medium',
        title: 'Compliance Backlog Pending',
        message: `${dashboard.complianceCaseBacklog.pending} compliance case(s) are pending.`,
        source: 'compliance',
        createdAt,
        action: '/compliance/reports?status=pending',
        metadata: { pending: dashboard.complianceCaseBacklog.pending },
      });
    }

    if (dashboard.pendingMultisigApprovals.count > 0) {
      alerts.push({
        id: 'multisig-approvals-pending',
        severity: 'medium',
        title: 'Multi-Sig Approvals Pending',
        message: `${dashboard.pendingMultisigApprovals.count} transaction(s) are waiting for approval.`,
        source: 'multi-sig',
        createdAt,
        action: '/transactions/pending-approvals',
        metadata: { count: dashboard.pendingMultisigApprovals.count },
      });
    }

    if (dashboard.recentWebhookFailures.last24HoursCount > 0) {
      alerts.push({
        id: 'webhook-failures-present',
        severity: 'medium',
        title: 'Webhook Failures Detected',
        message: `${dashboard.recentWebhookFailures.last24HoursCount} webhook delivery failure(s) occurred in the last 24 hours.`,
        source: 'webhooks',
        createdAt,
        action: '/admin/webhooks/failures',
        metadata: {
          count: dashboard.recentWebhookFailures.last24HoursCount,
        },
      });
    }

    if (dashboard.maintenanceStatus.active) {
      alerts.push({
        id: 'maintenance-mode-active',
        severity: 'low',
        title: 'Maintenance Mode Active',
        message: `Maintenance is enabled for: ${dashboard.maintenanceStatus.flags.join(', ') || 'general operations'}.`,
        source: 'maintenance',
        createdAt,
        action: '/admin/feature-flags',
      });
    }

    return alerts;
  }

  private sortAlerts(alerts: DashboardAlertDto[]): DashboardAlertDto[] {
    return [...alerts].sort((a, b) => {
      const severityDelta =
        ALERT_SEVERITY_RANK[b.severity] - ALERT_SEVERITY_RANK[a.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  private async emitNewAlerts(alerts: DashboardAlertDto[]): Promise<void> {
    const gateway = this.getNotificationsGateway();
    const nextActiveIds = new Set(alerts.map((alert) => alert.id));
    const newAlerts = alerts.filter((alert) => !this.activeAlertIds.has(alert.id));

    if (!gateway || newAlerts.length === 0) {
      this.activeAlertIds = nextActiveIds;
      return;
    }

    await Promise.all(
      newAlerts.map(async (alert) => {
        gateway.emitDashboardAlert({
          ...alert,
          metadata: alert.metadata ?? {},
        });
      }),
    );

    this.activeAlertIds = nextActiveIds;
  }

  private getNotificationsGateway(): NotificationsGateway | null {
    try {
      return this.moduleRef.get(NotificationsGateway, { strict: false });
    } catch (error) {
      this.logger.debug('NotificationsGateway unavailable for dashboard alert emission');
      return null;
    }
  }

  private mapHealthToCircuitBreakerState(status: RpcHealthLogEntity['status']): CircuitBreakerStatus {
    if (status === 'down') {
      return 'open';
    }

    if (status === 'degraded') {
      return 'half_open';
    }

    return 'closed';
  }
}
