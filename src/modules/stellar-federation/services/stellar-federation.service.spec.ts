import { NotFoundException } from '@nestjs/common';
import { StellarFederationService } from './stellar-federation.service';

describe('StellarFederationService', () => {
  const findOneMock = jest.fn();
  const findMock = jest.fn();
  const saveMock = jest.fn();
  const repository = { findOne: findOneMock, find: findMock, save: saveMock, create: jest.fn((x) => x) } as never;
  const service = new StellarFederationService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('resolves a well-formed user*domain.com address', async () => {
    const address = { id: 'addr-1', stellarAddress: 'alice', domain: 'example.com' };
    findOneMock.mockResolvedValue(address);

    await expect(service.resolveAddress('alice*example.com')).resolves.toBe(address);
    expect(findOneMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { domain: 'example.com', stellarAddress: 'alice', isActive: true } }),
    );
  });

  it('rejects an address with no "*"', async () => {
    await expect(service.resolveAddress('alice-example.com')).rejects.toThrow(NotFoundException);
  });

  it('only returns the requesting user\'s addresses', async () => {
    findMock.mockResolvedValue([{ id: 'a1', userId: 'user-1' }]);

    await service.getAddressesByUser('user-1');

    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('throws NotFoundException instead of deleting when userId does not match', async () => {
    findOneMock.mockResolvedValue(null);

    await expect(service.deleteAddress('addr-1', 'someone-else')).rejects.toThrow(NotFoundException);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
