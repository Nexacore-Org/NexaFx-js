import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApprovalService } from './approval.service';
import { AdminApproval, AdminApprovalStatus } from './admin-approval.entity';
import { ApprovalActionType, CreateApprovalDto } from './dto/approval.dto';

type Row = Partial<AdminApproval> & { id: string };

/** In-memory approvals table whose transaction commits or rolls back its writes. */
function build(initial: Row | null) {
  let committed: Row | null = initial ? { ...initial } : null;
  // Transactions run one at a time, like two writers contending for the same row lock.
  let queue: Promise<unknown> = Promise.resolve();
  const approvalsRepo: any = {
    create: jest.fn((v) => ({ id: 'a1', ...v })),
    save: jest.fn(async (v) => v),
    update: jest.fn(async (where: any, patch: any) => {
      if (!committed || (where.status && committed.status !== where.status)) return { affected: 0 };
      Object.assign(committed, patch);
      return { affected: 1 };
    }),
    manager: {
      transaction: jest.fn((cb: (m: any) => Promise<unknown>) => {
        const run = async () => {
        let working: Row | null = committed ? { ...committed } : null;
        const manager = {
          findOne: jest.fn(async () => (working ? { ...working } : null)),
          update: jest.fn(async (_e: unknown, where: any, patch: any) => {
            if (!working || (where.status && working.status !== where.status)) return { affected: 0 };
            Object.assign(working, patch);
            return { affected: 1 };
          }),
        };
        const result = await cb(manager); // throws => nothing below runs => rollback
        committed = working; // commit
        return result;
        };
        const next = queue.then(run, run);
        queue = next.catch(() => undefined);
        return next;
      }),
    },
  };
  const service = new ApprovalService(approvalsRepo);
  const handler = jest.fn().mockResolvedValue(undefined);
  service.registerHandler(ApprovalActionType.OVERRIDE_TRANSACTION_STATUS, handler);
  return { service, handler, approvalsRepo, get: () => committed };
}

const pending = (over: Partial<Row> = {}): Row => ({
  id: 'a1',
  actionType: ApprovalActionType.OVERRIDE_TRANSACTION_STATUS,
  actionData: { transactionId: 't1', newStatus: 'completed' },
  requestedBy: 'admin-1',
  status: AdminApprovalStatus.PENDING,
  ...over,
});

describe('ApprovalService (#1382)', () => {
  it('records the requester and rejects an unknown action type with 400', async () => {
    const { service, approvalsRepo } = build(null);
    await service.requestAdminApproval('update_user_status', { targetUserId: 'u', isActive: false }, 'admin-1');
    expect(approvalsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ requestedBy: 'admin-1' }));
    await expect(service.requestAdminApproval('drop_database', {}, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 403 (not 500) on self-approval and does not run the action', async () => {
    const { service, handler } = build(pending());
    await expect(service.approveAdminRequest('a1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 409 (not 500) for an approval that is not pending', async () => {
    const { service } = build(pending({ status: AdminApprovalStatus.APPROVED }));
    await expect(service.approveAdminRequest('a1', 'admin-2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for an unknown approval', async () => {
    const { service } = build(null);
    await expect(service.approveAdminRequest('nope', 'admin-2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approves and runs the action on the same transaction manager', async () => {
    const { service, handler, get } = build(pending());
    await service.approveAdminRequest('a1', 'admin-2');
    expect(handler).toHaveBeenCalledWith(
      { transactionId: 't1', newStatus: 'completed' },
      'admin-2',
      expect.objectContaining({ findOne: expect.any(Function) }),
    );
    expect(get()?.status).toBe(AdminApprovalStatus.APPROVED);
  });

  it('leaves the approval PENDING (and records the error) when the action fails', async () => {
    const { service, handler, get } = build(pending());
    handler.mockRejectedValue(new Error('transaction not found'));
    await expect(service.approveAdminRequest('a1', 'admin-2')).rejects.toThrow('transaction not found');
    expect(get()?.status).toBe(AdminApprovalStatus.PENDING);
    expect(get()?.lastError).toBe('transaction not found');
  });

  it('refuses to approve an action type nobody registered a handler for', async () => {
    const { service, get } = build(pending({ actionType: ApprovalActionType.UPDATE_USER_STATUS }));
    await expect(service.approveAdminRequest('a1', 'admin-2')).rejects.toBeInstanceOf(BadRequestException);
    expect(get()?.status).toBe(AdminApprovalStatus.PENDING);
  });

  it('runs the action exactly once when two admins approve concurrently', async () => {
    const { service, handler } = build(pending());
    const results = await Promise.allSettled([
      service.approveAdminRequest('a1', 'admin-2'),
      service.approveAdminRequest('a1', 'admin-3'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('CreateApprovalDto (#1382)', () => {
  const check = (body: object) => validate(plainToInstance(CreateApprovalDto, body) as object);

  it('validates the action type and the per-type action data', async () => {
    const ok = {
      actionType: 'override_transaction_status',
      actionData: { transactionId: '3f9c1d44-0f1e-4a77-9d0a-2b1f0d1c2e3f', newStatus: 'completed' },
    };
    expect(await check(ok)).toHaveLength(0);
    expect(await check({ ...ok, actionType: 'drop_database' })).not.toHaveLength(0);
    expect(await check({ ...ok, actionData: { transactionId: 'not-a-uuid', newStatus: 'completed' } })).not.toHaveLength(0);
    expect(
      await check({ actionType: 'update_user_status', actionData: { targetUserId: '3f9c1d44-0f1e-4a77-9d0a-2b1f0d1c2e3f', isActive: 'yes' } }),
    ).not.toHaveLength(0);
  });
});
