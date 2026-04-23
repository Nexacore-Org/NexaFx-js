import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardController } from '../src/modules/admin/controllers/dashboard.controller';
import { DashboardService } from '../src/modules/admin/services/dashboard.service';
import { AdminGuard } from '../src/modules/auth/guards/admin.guard';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { DeviceEntity } from '../src/modules/sessions/entities/device.entity';
import { WebhookDeliveryEntity } from '../src/modules/webhooks/entities/webhook-delivery.entity';
import { ComplianceReport } from '../src/compliance-evidence/compliance-report.entity';
import { FeatureFlagEntity } from '../src/modules/feature-flags/entities/feature-flag.entity';
import { RpcHealthLogEntity } from '../src/modules/rpc-health/entities/rpc-health-log.entity';
import { NotificationsGateway } from '../src/web-sockets/notifications.gateway';

const makeRepoMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const delayed = <T>(value: T, ms = 120) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('Admin Dashboard API (integration)', () => {
  let controller: DashboardController;
  let dashboardService: DashboardService;
  let adminGuard: AdminGuard;
  let notificationsGateway: { emitDashboardAlert: jest.Mock };

  const transactionRepo = makeRepoMock();
  const deviceRepo = makeRepoMock();
  const webhookRepo = makeRepoMock();
  const complianceRepo = makeRepoMock();
  const featureFlagRepo = makeRepoMock();
  const rpcHealthRepo = makeRepoMock();

  const systemHealth = {
    status: 'unhealthy' as const,
    checkedAt: '2026-03-25T10:00:00.000Z',
    circuitBreakers: [
      {
        name: 'eth-mainnet',
        source: 'https://rpc.example',
        state: 'open' as const,
        lastStatus: 'down' as const,
        latencyMs: 980,
        checkedAt: '2026-03-25T10:00:00.000Z',
      },
    ],
  };

  const activeSessions = {
    count: 12,
    windowMinutes: 30,
  };

  const highRiskTransactions = {
    count: 2,
    threshold: 70,
    timeWindowHours: 24,
    items: [
      {
        id: 'tx-high-1',
        amount: 5000,
        currency: 'USD',
        status: 'PENDING',
        riskScore: 91,
        createdAt: '2026-03-25T09:30:00.000Z',
        walletId: 'wallet-1',
      },
    ],
  };

  const complianceBacklog = {
    pending: 3,
    processing: 1,
    failed: 0,
    total: 4,
    oldestPendingAt: '2026-03-25T08:00:00.000Z',
  };

  const pendingApprovals = {
    count: 1,
    items: [
      {
        id: 'tx-approval-1',
        amount: 2200,
        currency: 'USD',
        status: 'PENDING_APPROVAL',
        createdAt: '2026-03-25T08:10:00.000Z',
        requiredApprovals: null,
        currentApprovals: null,
      },
    ],
  };

  const webhookFailures = {
    count: 1,
    last24HoursCount: 4,
    items: [
      {
        id: 'delivery-1',
        eventName: 'transaction.failed',
        subscriptionId: 'sub-1',
        attempts: 3,
        lastHttpStatus: 500,
        lastError: 'timeout',
        createdAt: '2026-03-25T09:45:00.000Z',
      },
    ],
  };

  const maintenanceStatus = {
    active: true,
    flags: ['maintenance_mode'],
    updatedAt: '2026-03-25T09:50:00.000Z',
  };

  beforeAll(async () => {
    notificationsGateway = {
      emitDashboardAlert: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        AdminGuard,
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: getRepositoryToken(TransactionEntity), useValue: transactionRepo },
        { provide: getRepositoryToken(DeviceEntity), useValue: deviceRepo },
        { provide: getRepositoryToken(WebhookDeliveryEntity), useValue: webhookRepo },
        { provide: getRepositoryToken(ComplianceReport), useValue: complianceRepo },
        { provide: getRepositoryToken(FeatureFlagEntity), useValue: featureFlagRepo },
        { provide: getRepositoryToken(RpcHealthLogEntity), useValue: rpcHealthRepo },
      ],
    }).compile();

    controller = moduleFixture.get(DashboardController);
    dashboardService = moduleFixture.get(DashboardService);
    adminGuard = moduleFixture.get(AdminGuard);
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    notificationsGateway.emitDashboardAlert.mockReset();
    await dashboardService.invalidateCache();
    (dashboardService as any).activeAlertIds = new Set();

    jest
      .spyOn(dashboardService as any, 'buildSystemHealthSection')
      .mockResolvedValue(systemHealth);
    jest
      .spyOn(dashboardService as any, 'buildActiveSessionsSection')
      .mockResolvedValue(activeSessions);
    jest
      .spyOn(dashboardService as any, 'buildRecentHighRiskTransactionsSection')
      .mockResolvedValue(highRiskTransactions);
    jest
      .spyOn(dashboardService as any, 'buildComplianceBacklogSection')
      .mockResolvedValue(complianceBacklog);
    jest
      .spyOn(dashboardService as any, 'buildPendingMultisigApprovalsSection')
      .mockResolvedValue(pendingApprovals);
    jest
      .spyOn(dashboardService as any, 'buildRecentWebhookFailuresSection')
      .mockResolvedValue(webhookFailures);
    jest
      .spyOn(dashboardService as any, 'buildMaintenanceStatusSection')
      .mockResolvedValue(maintenanceStatus);
  });

  it('requires admin role', () => {
    const makeContext = (xAdmin?: string): ExecutionContext =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            headers: xAdmin ? { 'x-admin': xAdmin } : {},
          }),
        }),
      }) as ExecutionContext;

    expect(() => adminGuard.canActivate(makeContext())).toThrow('Admin access required');
    expect(adminGuard.canActivate(makeContext('true'))).toBe(true);
  });

  it('returns all 8 dashboard sections in a single response and emits new alerts', async () => {
    const response = await controller.getDashboard();

    expect(response).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(String),
        cacheTtlSeconds: 10,
        systemHealth: expect.any(Object),
        activeSessions: expect.any(Object),
        recentHighRiskTransactions: expect.any(Object),
        complianceCaseBacklog: expect.any(Object),
        pendingMultisigApprovals: expect.any(Object),
        recentWebhookFailures: expect.any(Object),
        maintenanceStatus: expect.any(Object),
        quickActions: expect.any(Array),
      }),
    );
    expect(response.quickActions.length).toBeGreaterThan(0);
    expect(notificationsGateway.emitDashboardAlert).toHaveBeenCalledTimes(6);
  });

  it('assembles dashboard data in parallel within 500ms', async () => {
    jest
      .spyOn(dashboardService as any, 'buildSystemHealthSection')
      .mockImplementation(() => delayed(systemHealth));
    jest
      .spyOn(dashboardService as any, 'buildActiveSessionsSection')
      .mockImplementation(() => delayed(activeSessions));
    jest
      .spyOn(dashboardService as any, 'buildRecentHighRiskTransactionsSection')
      .mockImplementation(() => delayed(highRiskTransactions));
    jest
      .spyOn(dashboardService as any, 'buildComplianceBacklogSection')
      .mockImplementation(() => delayed(complianceBacklog));
    jest
      .spyOn(dashboardService as any, 'buildPendingMultisigApprovalsSection')
      .mockImplementation(() => delayed(pendingApprovals));
    jest
      .spyOn(dashboardService as any, 'buildRecentWebhookFailuresSection')
      .mockImplementation(() => delayed(webhookFailures));
    jest
      .spyOn(dashboardService as any, 'buildMaintenanceStatusSection')
      .mockImplementation(() => delayed(maintenanceStatus));

    const startedAt = Date.now();
    await controller.getDashboard();
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it('caches dashboard data for 10 seconds', async () => {
    const buildSystemHealthSpy = jest.spyOn(
      dashboardService as any,
      'buildSystemHealthSection',
    );

    await controller.getDashboard();
    await controller.getDashboard();

    expect(buildSystemHealthSpy).toHaveBeenCalledTimes(1);
    expect(notificationsGateway.emitDashboardAlert).toHaveBeenCalledTimes(6);
  });

  it('returns active alerts sorted by severity', async () => {
    const alerts = await controller.getActiveAlerts();

    expect(alerts.map((alert) => alert.severity)).toEqual([
      'critical',
      'high',
      'medium',
      'medium',
      'medium',
      'low',
    ]);
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        id: 'system-health-unhealthy',
        source: 'system-health',
      }),
    );
  });

  it('uses the required WebSocket payload structure', async () => {
    await controller.getDashboard();

    expect(notificationsGateway.emitDashboardAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: expect.any(String),
        severity: expect.any(String),
        entityId: expect.any(String),
        entityType: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('invalidates cache when a new CRITICAL alert is detected', async () => {
    const buildSystemHealthSpy = jest.spyOn(dashboardService as any, 'buildSystemHealthSection');

    // Reset mocks for this test
    buildSystemHealthSpy.mockReset();

    // First call: system is healthy (no critical alert)
    const healthyHealth = { ...systemHealth, status: 'healthy' as const, circuitBreakers: [] };
    buildSystemHealthSpy.mockResolvedValue(healthyHealth);

    await controller.getDashboard();
    expect(buildSystemHealthSpy).toHaveBeenCalledTimes(1);

    // Second call: system becomes unhealthy (new critical alert)
    buildSystemHealthSpy.mockResolvedValue(systemHealth); // systemHealth is unhealthy (critical)

    await controller.getDashboard();
    expect(buildSystemHealthSpy).toHaveBeenCalledTimes(2);

    // Third call: cache should have been invalidated by the second call's critical alert
    await controller.getDashboard();
    expect(buildSystemHealthSpy).toHaveBeenCalledTimes(3);
  });
});
