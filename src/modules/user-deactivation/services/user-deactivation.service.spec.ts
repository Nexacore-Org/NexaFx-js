import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserDeactivationService } from './user-deactivation.service';

describe('UserDeactivationService', () => {
  const findOneMock = jest.fn();
  const createMock = jest.fn((v) => v);
  const saveMock = jest.fn((v) => v);
  const repo = { findOne: findOneMock, create: createMock, save: saveMock } as any;
  const service = new UserDeactivationService(repo);

  beforeEach(() => jest.clearAllMocks());

  it('deactivates an active user and stores the reason', async () => {
    findOneMock.mockResolvedValue(null);

    const result = await service.deactivate('user-1', { reason: 'fraud' } as any, 'admin-1');

    expect(result).toMatchObject({ userId: 'user-1', reason: 'fraud', isActive: true });
  });

  it('rejects deactivating an already-deactivated user', async () => {
    findOneMock.mockResolvedValue({ userId: 'user-1', isActive: true });

    await expect(
      service.deactivate('user-1', { reason: 'fraud' } as any, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivates a deactivated user', async () => {
    findOneMock.mockResolvedValue({ userId: 'user-1', isActive: true });

    const result = await service.reactivate('user-1', 'admin-1');

    expect(result.isActive).toBe(false);
    expect(result.reactivatedBy).toBe('admin-1');
  });

  it('throws when reactivating a user with no active deactivation', async () => {
    findOneMock.mockResolvedValue(null);

    await expect(service.reactivate('user-1', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('isUserDeactivated reflects deactivated vs active users', async () => {
    findOneMock.mockResolvedValueOnce({ userId: 'user-1', isActive: true });
    await expect(service.isUserDeactivated('user-1')).resolves.toBe(true);

    findOneMock.mockResolvedValueOnce(null);
    await expect(service.isUserDeactivated('user-2')).resolves.toBe(false);
  });
});
