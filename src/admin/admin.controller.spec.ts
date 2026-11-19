import { ApprovalActionType } from '../multi-signature-approval/dto/approval.dto';
import { AdminController } from './admin.controller';

/** Issue #1519: every route is wired to a method that exists; dual control uses ApprovalService. */
function build(dualControl: boolean) {
  const adminService = {
    isDualControlEnabled: jest.fn().mockReturnValue(dualControl),
    overrideTransactionStatus: jest.fn().mockResolvedValue({ ok: 'override' }),
    updateUserStatus: jest.fn().mockResolvedValue({ ok: 'status' }),
    updateUserRole: jest.fn().mockResolvedValue({ ok: 'role' }),
    impersonateUser: jest.fn().mockResolvedValue({ ok: 'impersonate' }),
    searchPlatform: jest.fn().mockResolvedValue({ query: 'ab', results: { users: [], transactions: [] } }),
    getStats: jest.fn(),
    generateCbnComplianceReport: jest.fn(),
    findAllTransactions: jest.fn(),
  };
  const approvalService = { requestAdminApproval: jest.fn().mockResolvedValue({ id: 'ap-1' }) };
  const spreadService = {
    getSpreads: jest.fn().mockResolvedValue({ 'USD/NGN': 0.01 }),
    updateSpread: jest.fn().mockResolvedValue({ pair: 'USD/NGN', spreadPercentage: 0.01 }),
  };
  const controller = new AdminController(adminService as any, approvalService as any, spreadService as any);
  return { controller, adminService, approvalService, spreadService };
}

describe('AdminController (issue #1519)', () => {
  it('declares impersonateUser exactly once, taking the reason DTO', () => {
    const { controller, adminService } = build(false);
    expect(AdminController.prototype.impersonateUser.length).toBe(3);

    controller.impersonateUser('u1', { reason: 'support ticket 42' }, 'admin-1');

    expect(adminService.impersonateUser).toHaveBeenCalledWith('u1', 'admin-1', 'support ticket 42');
  });

  it('search passes the validated query through', async () => {
    const { controller, adminService } = build(false);
    await controller.searchPlatform({ q: 'ab' });
    expect(adminService.searchPlatform).toHaveBeenCalledWith('ab');
  });

  it('with dual control on, status overrides are requested through ApprovalService, not executed', async () => {
    const { controller, adminService, approvalService } = build(true);

    await controller.overrideTransactionStatus('tx-1', { status: 'completed', reason: 'r' } as any, 'admin-1');
    await controller.updateUserStatus('u1', { isActive: false, reason: 'r' } as any, 'admin-1');

    expect(approvalService.requestAdminApproval).toHaveBeenNthCalledWith(
      1,
      ApprovalActionType.OVERRIDE_TRANSACTION_STATUS,
      { transactionId: 'tx-1', newStatus: 'completed', reason: 'r' },
      'admin-1',
    );
    expect(approvalService.requestAdminApproval).toHaveBeenNthCalledWith(
      2,
      ApprovalActionType.UPDATE_USER_STATUS,
      { targetUserId: 'u1', isActive: false, reason: 'r' },
      'admin-1',
    );
    expect(adminService.overrideTransactionStatus).not.toHaveBeenCalled();
    expect(adminService.updateUserStatus).not.toHaveBeenCalled();
  });

  it('with dual control off, they execute directly', async () => {
    const { controller, adminService, approvalService } = build(false);

    await controller.overrideTransactionStatus('tx-1', { status: 'completed', reason: 'r' } as any, 'admin-1');
    await controller.updateUserStatus('u1', { isActive: true, reason: 'r' } as any, 'admin-1');

    expect(adminService.overrideTransactionStatus).toHaveBeenCalledWith('tx-1', 'completed', 'admin-1', 'r');
    expect(adminService.updateUserStatus).toHaveBeenCalledWith('u1', true, 'admin-1', 'r');
    expect(approvalService.requestAdminApproval).not.toHaveBeenCalled();
  });

  it('role changes go straight to the service', async () => {
    const { controller, adminService } = build(true);
    await controller.updateUserRole('u1', { role: 'user', reason: 'because' } as any, 'admin-1');
    expect(adminService.updateUserRole).toHaveBeenCalledWith('u1', 'user', 'admin-1', 'because');
  });

  it('spreads are read and written through SpreadService with the reason (issue #1520)', async () => {
    const { controller, spreadService } = build(false);

    await expect(controller.getSpreads()).resolves.toEqual({ 'USD/NGN': 0.01 });
    await controller.updateSpread({ pair: 'USD/NGN', spreadPercentage: 0.01, reason: 'q3 pricing' }, 'admin-1');

    expect(spreadService.updateSpread).toHaveBeenCalledWith('USD/NGN', 0.01, 'admin-1', 'q3 pricing');
  });
});
