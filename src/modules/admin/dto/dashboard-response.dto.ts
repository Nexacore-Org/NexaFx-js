export type DashboardAlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export class SystemHealthCircuitBreakerDto {
  name: string;
  state: 'closed' | 'half_open' | 'open';
  source: string;
  lastStatus: 'up' | 'down' | 'degraded';
  latencyMs: number | null;
  checkedAt: string | null;
}

export class SystemHealthSectionDto {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checkedAt: string;
  circuitBreakers: SystemHealthCircuitBreakerDto[];
}

export class ActiveSessionCountSectionDto {
  count: number;
  windowMinutes: number;
}

export class HighRiskTransactionItemDto {
  id: string;
  amount: number;
  currency: string;
  status: string;
  riskScore: number;
  createdAt: string;
  walletId?: string | null;
}

export class RecentHighRiskTransactionsSectionDto {
  count: number;
  threshold: number;
  timeWindowHours: number;
  items: HighRiskTransactionItemDto[];
}

export class ComplianceCaseBacklogSectionDto {
  pending: number;
  processing: number;
  failed: number;
  total: number;
  oldestPendingAt: string | null;
}

export class PendingMultisigApprovalItemDto {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  requiredApprovals?: number | null;
  currentApprovals?: number | null;
}

export class PendingMultisigApprovalsSectionDto {
  count: number;
  items: PendingMultisigApprovalItemDto[];
}

export class RecentWebhookFailureItemDto {
  id: string;
  eventName: string;
  subscriptionId: string;
  attempts: number;
  lastHttpStatus?: number | null;
  lastError?: string | null;
  createdAt: string;
}

export class RecentWebhookFailuresSectionDto {
  count: number;
  last24HoursCount: number;
  items: RecentWebhookFailureItemDto[];
}

export class MaintenanceStatusSectionDto {
  active: boolean;
  flags: string[];
  updatedAt: string | null;
}

export class QuickActionDto {
  id: string;
  label: string;
  action: string;
  enabled: boolean;
  priority: number;
  reason?: string;
}

export class DashboardAlertDto {
  id: string;
  severity: DashboardAlertSeverity;
  title: string;
  message: string;
  source: string;
  createdAt: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export class DashboardResponseDto {
  generatedAt: string;
  cacheTtlSeconds: number;
  systemHealth: SystemHealthSectionDto;
  activeSessions: ActiveSessionCountSectionDto;
  recentHighRiskTransactions: RecentHighRiskTransactionsSectionDto;
  complianceCaseBacklog: ComplianceCaseBacklogSectionDto;
  pendingMultisigApprovals: PendingMultisigApprovalsSectionDto;
  recentWebhookFailures: RecentWebhookFailuresSectionDto;
  maintenanceStatus: MaintenanceStatusSectionDto;
  quickActions: QuickActionDto[];
}
