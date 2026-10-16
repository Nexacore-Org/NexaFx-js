import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminApproval, AdminApprovalStatus } from './admin-approval.entity';
import { TransactionStatus } from '../transactions/transaction.entity';

type Row = Partial<AdminApproval> & { id: string };

/** In-memory stand-in for the approvals table with an atomic conditional update. */
function build(initial: Row | null) {
  let row: Row | null = initial ? { ...initial } : null;

  const manager = {
    findOne: jest.fn(async () => (row ? { ...row } : null)),
    update: jest.fn(async (_entity: unknown, where: Partial<Row>, patch: Partial<Row>) => {
      if (!row || (where.status && row.status !== where.status) || (where.id && row.id !== where.id)) {
        return { affected: 0 };
      }
      Object.assign(row, patch);
      return { affected: 1 };
    }),
    transaction: undefined as unknown,
  };

  const approvalsRepo = {
    create: jest.fn((v) => ({ id: 'a1', ...v })),
    save: jest.fn(async (v) => v),
    find: jest.fn(),
    findOne: jest.fn(async () => (row ? { ...row } : null)),
    update: jest.fn(manager.update),
    manager: {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new AdminService(
    {} as any, // users
    {} as any, // transactions
    {} as any, // kyc
    {} as any, // tickets
    {} as any, // webhooks
    {} as any, // aml
    approvalsRepo as any,
    audit as any,
  );
  const override = jest.spyOn(service, 'overrideTransactionStatus').mockResolvedValue({} as any);
  const setStatus = jest.spyOn(service, 'updateUserStatus').mockResolvedValue({} as any);
  return { service, approvalsRepo, manager, audit, override, setStatus, getRow: () => row };
}

const pendingTxApproval = (over: Partial<Row> = {}): Row => ({
  id: 'a1',
  actionType: 'override_transaction_status',
  actionData: { transactionId: 't1', newStatus: TransactionStatus.COMPLETED, reason: 'ok' },
  requestedBy: 'admin-1',
  status: AdminApprovalStatus.PENDING,
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
});

describe('AdminService approvals (four-eyes control)', () => {
  it('records the requester and an expiry on a new request', async () => {
    const { service, approvalsRepo } = build(null);
    await service.requestAdminApproval('update_user_status', { targetUserId: 'u', isActive: false }, 'admin-1');
    expect(approvalsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'admin-1', expiresAt: expect.any(Date) }),
    );
  });

  it('rejects an unknown action type with 400', async () => {
    const { service } = build(null);
    await expect(service.requestAdminApproval('drop_database', {}, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a request without an authenticated requester', async () => {
    const { service } = build(null);
    await expect(
      service.requestAdminApproval('update_user_status', {}, undefined as unknown as string),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 403 on self-approval and does not execute', async () => {
    const { service, override } = build(pendingTxApproval());
    await expect(service.approveAdminRequest('a1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(override).not.toHaveBeenCalled();
  });

  it('lets a second admin approve and executes the action once', async () => {
    const { service, override, getRow } = build(pendingTxApproval());
    await service.approveAdminRequest('a1', 'admin-2');
    expect(override).toHaveBeenCalledTimes(1);
    expect(override).toHaveBeenCalledWith('t1', TransactionStatus.COMPLETED, 'admin-2', 'ok');
    expect(getRow()?.status).toBe(AdminApprovalStatus.APPROVED);
  });

  it('executes exactly once when two admins approve concurrently', async () => {
    const { service, override } = build(pendingTxApproval());
    const results = await Promise.allSettled([
      service.approveAdminRequest('a1', 'admin-2'),
      service.approveAdminRequest('a1', 'admin-3'),
    ]);
    expect(override).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ConflictException);
  });

  it('returns 409 for an approval that is no longer pending', async () => {
    const { service } = build(pendingTxApproval({ status: AdminApprovalStatus.APPROVED }));
    await expect(service.approveAdminRequest('a1', 'admin-2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for an unknown approval', async () => {
    const { service } = build(null);
    await expect(service.approveAdminRequest('nope', 'admin-2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to approve an expired request', async () => {
    const { service, override } = build(pendingTxApproval({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.approveAdminRequest('a1', 'admin-2')).rejects.toBeInstanceOf(ConflictException);
    expect(override).not.toHaveBeenCalled();
  });

  it('runs a user status change through updateUserStatus', async () => {
    const { service, setStatus } = build(
      pendingTxApproval({
        actionType: 'update_user_status',
        actionData: { targetUserId: 'u9', isActive: false, reason: 'fraud' },
      }),
    );
    await service.approveAdminRequest('a1', 'admin-2');
    expect(setStatus).toHaveBeenCalledWith('u9', false, 'admin-2', 'fraud');
  });

  it('rejects a pending request and refuses a second rejection', async () => {
    const { service, audit } = build(pendingTxApproval());
    await service.rejectAdminRequest('a1', 'admin-2', 'not justified');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.approval.rejected' }));
    await expect(service.rejectAdminRequest('a1', 'admin-3')).rejects.toBeInstanceOf(ConflictException);
  });

  it('flags a pending request past its deadline as expired when listing', async () => {
    const { service, approvalsRepo } = build(null);
    approvalsRepo.find.mockResolvedValue([
      { id: 'a', status: AdminApprovalStatus.PENDING, expiresAt: new Date(Date.now() - 5) },
      { id: 'b', status: AdminApprovalStatus.PENDING, expiresAt: new Date(Date.now() + 60_000) },
    ]);
    const list = await service.listAdminApprovals(AdminApprovalStatus.PENDING);
    expect(list.map((a) => a.expired)).toEqual([true, false]);
  });

  it('dual control is driven by ADMIN_DUAL_CONTROL', () => {
    const { service } = build(null);
    process.env.ADMIN_DUAL_CONTROL = 'true';
    expect(service.isDualControlEnabled()).toBe(true);
    delete process.env.ADMIN_DUAL_CONTROL;
    expect(service.isDualControlEnabled()).toBe(false);
  });
});
