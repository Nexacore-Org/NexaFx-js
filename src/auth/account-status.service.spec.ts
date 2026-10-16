import { AccountStatusService } from './account-status.service';

describe('AccountStatusService', () => {
  const build = (user: unknown, deactivated = false) => {
    const users = { findByIdOrNull: jest.fn().mockResolvedValue(user) };
    const deactivation = { isUserDeactivated: jest.fn().mockResolvedValue(deactivated) };
    const tokens = { revokeUserTokens: jest.fn().mockResolvedValue(undefined) };
    const service = new AccountStatusService(users as any, deactivation as any, tokens as any);
    return { service, users, deactivation, tokens };
  };

  it('allows an active, non-deactivated user', async () => {
    const { service } = build({ id: 'u', isActive: true });
    await expect(service.isAllowedToAuthenticate('u')).resolves.toBe(true);
  });

  it('denies a suspended user (isActive=false)', async () => {
    const { service } = build({ id: 'u', isActive: false });
    await expect(service.isAllowedToAuthenticate('u')).resolves.toBe(false);
  });

  it('denies a deactivated user', async () => {
    const { service } = build({ id: 'u', isActive: true }, true);
    await expect(service.isAllowedToAuthenticate('u')).resolves.toBe(false);
  });

  it('denies a missing user', async () => {
    const { service } = build(null);
    await expect(service.isAllowedToAuthenticate('u')).resolves.toBe(false);
  });

  it('caches the answer until the access change event invalidates it', async () => {
    const { service, users } = build({ id: 'u', isActive: true });
    await service.isAllowedToAuthenticate('u');
    await service.isAllowedToAuthenticate('u');
    expect(users.findByIdOrNull).toHaveBeenCalledTimes(1);

    await service.handleAccessChanged({ userId: 'u', reason: 'suspended', revokeTokens: false });
    await service.isAllowedToAuthenticate('u');
    expect(users.findByIdOrNull).toHaveBeenCalledTimes(2);
  });

  it('revokes refresh tokens when access is lost', async () => {
    const { service, tokens } = build({ id: 'u', isActive: false });
    await service.handleAccessChanged({ userId: 'u', reason: 'deactivated', revokeTokens: true });
    expect(tokens.revokeUserTokens).toHaveBeenCalledWith('u');
  });

  it('reactivation restores access', async () => {
    const user = { id: 'u', isActive: false };
    const { service, users } = build(user);
    await expect(service.isAllowedToAuthenticate('u')).resolves.toBe(false);
    users.findByIdOrNull.mockResolvedValue({ id: 'u', isActive: true });
    await service.handleAccessChanged({ userId: 'u', reason: 'activated', revokeTokens: false });
    await expect(service.isAllowedToAuthenticate('u')).resolves.toBe(true);
  });
});
