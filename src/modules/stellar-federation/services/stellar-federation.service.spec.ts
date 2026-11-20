import { NotFoundException } from '@nestjs/common';
import { StellarFederationService } from './stellar-federation.service';

describe('StellarFederationService', () => {
  const findOneMock = jest.fn();
  const findMock = jest.fn();
  const saveMock = jest.fn();
  const repository = {
    findOne: findOneMock,
    find: findMock,
    save: saveMock,
    create: jest.fn((value: object) => value),
  } as never;
  const service = new StellarFederationService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    findOneMock.mockResolvedValue(null);
  });

  it('looks up a mixed-case user*domain.com address by lowercased name and domain', async () => {
    const address = {
      id: 'addr-1',
      name: 'alice',
      domain: 'example.com',
      stellarAddress: 'G-STELLAR-ADDRESS',
    };
    findOneMock.mockResolvedValue(address);

    await expect(service.resolveAddress('ALICE*example.com')).resolves.toBe(
      address,
    );
    expect(findOneMock).toHaveBeenCalledWith({
      where: { name: 'alice', domain: 'example.com', isActive: true },
    });
  });

  it('rejects an address with no "*"', async () => {
    await expect(service.resolveAddress('alice-example.com')).rejects.toThrow(
      NotFoundException,
    );
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for an unknown user and domain', async () => {
    await expect(service.resolveAddress('nobody*example.com')).rejects.toThrow(
      NotFoundException,
    );
    expect(findOneMock).toHaveBeenCalledWith({
      where: { name: 'nobody', domain: 'example.com', isActive: true },
    });
  });

  it("only returns the requesting user's addresses", async () => {
    findMock.mockResolvedValue([{ id: 'a1', userId: 'user-1' }]);

    await service.getAddressesByUser('user-1');

    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('throws NotFoundException instead of deleting when userId does not match', async () => {
    await expect(
      service.deleteAddress('addr-1', 'someone-else'),
    ).rejects.toThrow(NotFoundException);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
