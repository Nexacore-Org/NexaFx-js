import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserRole } from '../users/user.entity';
import { TOKEN_VERSION_CHANGED_EVENT } from '../auth/token-version.service';
import { USER_ACCESS_CHANGED_EVENT } from '../auth/account-status.service';

/** Issue #1518: updateUserStatus guardrails, token revocation and impersonation tv. */
function build(target: Record<string, unknown> | null, otherAdmins = 1) {
  const usersRepo: any = {
    findOne: jest.fn().mockResolvedValue(target),
    count: jest.fn().mockResolvedValue(otherAdmins),
    save: jest.fn(async (u: unknown) => u),
  };
  usersRepo.manager = { transaction: (fn: (m: unknown) => unknown) => fn({ getRepository: () => usersRepo }) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const jwt = { sign: jest.fn().mockReturnValue('signed') };
  const service = new AdminService(
    usersRepo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    audit as any,
    undefined,
    events as any,
    jwt as any,
  );
  return { service, usersRepo, audit, events, jwt };
}

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  role: UserRole.USER,
  isActive: true,
  kycStatus: 'approved',
  email: 'u@x.com',
  tokenVersion: 4,
  ...over,
});

describe('AdminService.updateUserStatus (issue #1518)', () => {
  it('404s for an unknown user', async () => {
    const { service } = build(null);
    await expect(service.updateUserStatus('nope', false, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('suspends: bumps tokenVersion, revokes tokens via events, audits with a before snapshot', async () => {
    const { service, usersRepo, audit, events } = build(user());

    const updated = await service.updateUserStatus('u1', false, 'admin-1', 'fraud review');

    expect(updated.isActive).toBe(false);
    expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 5 }));
    expect(events.emit).toHaveBeenCalledWith(TOKEN_VERSION_CHANGED_EVENT, { userId: 'u1' });
    expect(events.emit).toHaveBeenCalledWith(USER_ACCESS_CHANGED_EVENT, {
      userId: 'u1',
      reason: 'suspended',
      revokeTokens: true,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.user.suspended',
        before: expect.objectContaining({ isActive: true }),
        reason: 'fraud review',
      }),
    );
  });

  it('reactivation does not revoke tokens', async () => {
    const { service, events } = build(user({ isActive: false }));

    await service.updateUserStatus('u1', true, 'admin-1');

    expect(events.emit).toHaveBeenCalledWith(USER_ACCESS_CHANGED_EVENT, expect.objectContaining({ revokeTokens: false }));
  });

  it('refuses to let an admin change their own status', async () => {
    const { service } = build(user({ id: 'admin-1', role: UserRole.ADMIN }));
    await expect(service.updateUserStatus('admin-1', false, 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to suspend the last active admin', async () => {
    const { service } = build(user({ id: 'a2', role: UserRole.ADMIN }), 0);
    await expect(service.updateUserStatus('a2', false, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the approval workflow manager when one is passed', async () => {
    const { service } = build(user());
    const managerRepo: any = { findOne: jest.fn().mockResolvedValue(user()), count: jest.fn(), save: jest.fn(async (u: unknown) => u) };
    const manager: any = { getRepository: () => managerRepo };

    await service.updateUserStatus('u1', false, 'admin-1', undefined, manager);

    expect(managerRepo.save).toHaveBeenCalled();
  });
});

describe('AdminService.impersonateUser token version (issue #1518)', () => {
  it('puts the target user\'s tokenVersion on the impersonation token', async () => {
    const { service, jwt } = build(user({ role: UserRole.USER, tokenVersion: 7, isEmailVerified: true }));

    await service.impersonateUser('u1', 'admin-1', 'support ticket 42');

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ tv: 7, impersonation: true, act: { sub: 'admin-1' } }),
      expect.any(Object),
    );
  });

  it('refuses to impersonate admins', async () => {
    const { service } = build(user({ role: UserRole.ADMIN }));
    await expect(service.impersonateUser('u1', 'admin-1', 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
