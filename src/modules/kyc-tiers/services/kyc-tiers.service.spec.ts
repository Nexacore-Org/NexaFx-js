import { BadRequestException } from '@nestjs/common';
import { KycTiersService } from './kyc-tiers.service';

describe('KycTiersService', () => {
  const upgradeFindOne = jest.fn();
  const upgradeCreate = jest.fn((v) => v);
  const upgradeSave = jest.fn((v) => v);
  const userFindOne = jest.fn();
  const userSave = jest.fn((v) => v);

  const upgradeRepo = { findOne: upgradeFindOne, create: upgradeCreate, save: upgradeSave } as any;
  const userRepo = { findOne: userFindOne, save: userSave } as any;
  const service = new KycTiersService(upgradeRepo, userRepo);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a new request when one is already pending', async () => {
    userFindOne.mockResolvedValue({ id: 'u1', metadata: { kycTier: 'BASIC' } });
    upgradeFindOne.mockResolvedValue({ id: 'req-1', status: 'pending' });

    await expect(
      service.requestUpgrade('u1', { requestedTier: 'ADVANCED' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approving a request updates the user tier', async () => {
    upgradeFindOne.mockResolvedValue({
      id: 'req-1',
      status: 'pending',
      userId: 'u1',
      requestedTier: 'ADVANCED',
    });
    userFindOne.mockResolvedValue({ id: 'u1', metadata: {} });

    await service.approve('req-1', 'admin-1');

    expect(userSave).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { kycTier: 'ADVANCED' } }),
    );
  });

  it('rejecting a request leaves the tier unchanged', async () => {
    upgradeFindOne.mockResolvedValue({ id: 'req-1', status: 'pending', userId: 'u1' });

    await service.reject('req-1', 'admin-1', 'insufficient docs');

    expect(userFindOne).not.toHaveBeenCalled();
    expect(userSave).not.toHaveBeenCalled();
  });

  it('getStatus returns the latest upgrade record for the user', async () => {
    upgradeFindOne.mockResolvedValue({ id: 'req-1', userId: 'u1', status: 'pending' });

    await expect(service.getStatus('u1')).resolves.toMatchObject({ userId: 'u1' });
  });
});
