import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountFreezeService } from './account-freeze.service';

describe('AccountFreezeService', () => {
  const findOneMock = jest.fn();
  const createMock = jest.fn((v) => v);
  const saveMock = jest.fn((v) => v);
  const repo = { findOne: findOneMock, create: createMock, save: saveMock } as any;
  const service = new AccountFreezeService(repo);

  beforeEach(() => jest.clearAllMocks());

  it('freezes an active account and persists a freeze record', async () => {
    findOneMock.mockResolvedValue(null);

    const result = await service.freezeAccount('user-1', 'fraud review', 'admin-1');

    expect(result).toMatchObject({ userId: 'user-1', isActive: true });
    expect(saveMock).toHaveBeenCalled();
  });

  it('rejects freezing an already-frozen account', async () => {
    findOneMock.mockResolvedValue({ userId: 'user-1', isActive: true });

    await expect(
      service.freezeAccount('user-1', 'fraud review', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('unfreezes an active freeze', async () => {
    findOneMock.mockResolvedValue({ userId: 'user-1', isActive: true });

    const result = await service.unfreezeAccount('user-1', 'admin-1');

    expect(result.isActive).toBe(false);
    expect(result.unfrozenBy).toBe('admin-1');
  });

  it('throws when unfreezing an account with no active freeze', async () => {
    findOneMock.mockResolvedValue(null);

    await expect(service.unfreezeAccount('user-1', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports whether an account is currently frozen', async () => {
    findOneMock.mockResolvedValueOnce({ userId: 'user-1', isActive: true });
    await expect(service.isAccountFrozen('user-1')).resolves.toBe(true);

    findOneMock.mockResolvedValueOnce(null);
    await expect(service.isAccountFrozen('user-1')).resolves.toBe(false);
  });
});
