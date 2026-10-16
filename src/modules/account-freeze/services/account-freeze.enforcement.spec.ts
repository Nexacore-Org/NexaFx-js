import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountFreezeService } from './account-freeze.service';

describe('AccountFreezeService (integrity and enforcement)', () => {
  const build = (opts: { userExists?: boolean; active?: unknown; saveError?: unknown } = {}) => {
    const freezeRepo = {
      findOne: jest.fn().mockResolvedValue(opts.active ?? null),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        if (opts.saveError) throw opts.saveError;
        return { id: 'freeze-1', ...v };
      }),
      find: jest.fn(),
    };
    const usersRepo = { exist: jest.fn().mockResolvedValue(opts.userExists ?? true) };
    const audit = { log: jest.fn() };
    const events = { emit: jest.fn() };
    const service = new AccountFreezeService(
      freezeRepo as any,
      usersRepo as any,
      audit as any,
      events as any,
    );
    return { service, freezeRepo, usersRepo, audit, events };
  };

  it('freezes an existing user, writes an audit entry and emits account.frozen', async () => {
    const { service, audit, events } = build();
    const freeze = await service.freezeAccount('u1', 'AML hit', 'admin-1');
    expect(freeze.isActive).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'account.frozen', entityId: 'u1' }));
    expect(events.emit).toHaveBeenCalledWith('account.frozen', expect.objectContaining({ userId: 'u1' }));
  });

  it('returns 404 when freezing a non-existent user', async () => {
    const { service } = build({ userExists: false });
    await expect(service.freezeAccount('typo', 'x', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 409 when the account is already frozen', async () => {
    const { service } = build({ active: { id: 'f', isActive: true } });
    await expect(service.freezeAccount('u1', 'x', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a unique-index violation from a concurrent freeze to 409', async () => {
    const { service } = build({ saveError: { code: '23505' } });
    await expect(service.freezeAccount('u1', 'x', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('assertNotFrozen throws 403 for a frozen account and passes otherwise', async () => {
    const frozen = build({ active: { id: 'f', isActive: true } });
    await expect(frozen.service.assertNotFrozen('u1')).rejects.toBeInstanceOf(ForbiddenException);
    const free = build();
    await expect(free.service.assertNotFrozen('u1')).resolves.toBeUndefined();
  });

  it('unfreeze audits and emits account.unfrozen', async () => {
    const { service, audit, events } = build({ active: { id: 'f', userId: 'u1', isActive: true } });
    await service.unfreezeAccount('u1', 'admin-2');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'account.unfrozen' }));
    expect(events.emit).toHaveBeenCalledWith('account.unfrozen', expect.objectContaining({ userId: 'u1' }));
  });
});
