import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserDeactivationService } from './user-deactivation.service';
import { UserDeactivationEntity } from '../entities/user-deactivation.entity';
import { User, UserRole } from '../../../users/user.entity';
import { TOKEN_VERSION_CHANGED_EVENT } from '../../../auth/token-version.service';
import { USER_ACCESS_CHANGED_EVENT } from '../../../auth/account-status.service';

interface Opts {
  user?: Partial<User> | null;
  existing?: unknown;
  otherAdmins?: number;
  saveError?: unknown;
}

function build(opts: Opts = {}) {
  const user: any = opts.user === null ? null : { id: 'user-1', role: UserRole.USER, isActive: true, tokenVersion: 2, ...(opts.user ?? {}) };
  const manager: any = {
    findOne: jest.fn(async (entity: unknown) => (entity === User ? user : (opts.existing ?? null))),
    count: jest.fn(async () => opts.otherAdmins ?? 1),
    create: jest.fn((_e: unknown, v: any) => v),
    save: jest.fn(async (_e: unknown, v: any) => {
      if (opts.saveError && _e === UserDeactivationEntity) throw opts.saveError;
      return v;
    }),
  };
  const repo: any = {
    manager: { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)) },
    findOne: jest.fn(),
    findAndCount: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const service = new UserDeactivationService(repo, audit as any, events as any);
  return { service, repo, manager, audit, events, user };
}

describe('UserDeactivationService.deactivate (issue #1523)', () => {
  it('stores the reason and the real admin id, audits in the same transaction', async () => {
    const { service, manager, audit } = build();

    const result = await service.deactivate('user-1', { reason: 'confirmed fraud' }, 'admin-1');

    expect(result).toMatchObject({ userId: 'user-1', reason: 'confirmed fraud', deactivatedBy: 'admin-1', isActive: true });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', action: 'admin.user.deactivated', entityId: 'user-1', reason: 'confirmed fraud' }),
      manager,
    );
  });

  it('bumps tokenVersion and announces the change so access stops immediately', async () => {
    const { service, user, events } = build();

    await service.deactivate('user-1', { reason: 'confirmed fraud' }, 'admin-1');

    expect(user.tokenVersion).toBe(3);
    expect(events.emit).toHaveBeenCalledWith(TOKEN_VERSION_CHANGED_EVENT, { userId: 'user-1' });
    expect(events.emit).toHaveBeenCalledWith(
      USER_ACCESS_CHANGED_EVENT,
      expect.objectContaining({ reason: 'deactivated', revokeTokens: true }),
    );
  });

  it('404s for an unknown user', async () => {
    const { service } = build({ user: null });
    await expect(service.deactivate('ghost', { reason: 'confirmed fraud' }, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses self-deactivation', async () => {
    const { service } = build();
    await expect(service.deactivate('admin-1', { reason: 'confirmed fraud' }, 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a missing admin id (no "system" fallback)', async () => {
    const { service } = build();
    await expect(service.deactivate('user-1', { reason: 'confirmed fraud' }, '')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses to deactivate the last active admin', async () => {
    const { service } = build({ user: { role: UserRole.ADMIN }, otherAdmins: 0 });
    await expect(service.deactivate('user-1', { reason: 'confirmed fraud' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects deactivating an already-deactivated user', async () => {
    const { service } = build({ existing: { userId: 'user-1', isActive: true } });
    await expect(service.deactivate('user-1', { reason: 'confirmed fraud' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a unique-index violation from a concurrent request to 409', async () => {
    const { service } = build({ saveError: Object.assign(new Error('duplicate key'), { code: '23505' }) });
    await expect(service.deactivate('user-1', { reason: 'confirmed fraud' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UserDeactivationService.reactivate / history (issue #1523)', () => {
  it('reactivates, records the admin and audits', async () => {
    const { service, manager, audit } = build({ existing: { userId: 'user-1', isActive: true } });

    const result = await service.reactivate('user-1', 'admin-1');

    expect(result.isActive).toBe(false);
    expect(result.reactivatedBy).toBe('admin-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.user.reactivated' }), manager);
  });

  it('throws when there is no active deactivation', async () => {
    const { service } = build({ existing: null });
    await expect(service.reactivate('user-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('isUserDeactivated reflects the active record', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValueOnce({ userId: 'user-1', isActive: true });
    await expect(service.isUserDeactivated('user-1')).resolves.toBe(true);
    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.isUserDeactivated('user-1')).resolves.toBe(false);
  });

  it('history is paginated', async () => {
    const { service, repo } = build();
    repo.findAndCount.mockResolvedValue([[{ id: 'd1' }], 7]);

    const page = await service.getHistory('user-1', 2, 3);

    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 3, take: 3, where: { userId: 'user-1' } }));
    expect(page).toEqual({ data: [{ id: 'd1' }], total: 7, page: 2, limit: 3 });
  });
});
