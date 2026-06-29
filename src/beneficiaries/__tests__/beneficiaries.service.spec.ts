import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BeneficiariesService } from '../beneficiaries.service';
import { Beneficiary } from '../beneficiary.entity';

describe('BeneficiariesService', () => {
  let service: BeneficiariesService;
  let repo: jest.Mocked<Pick<Repository<Beneficiary>, 'find' | 'findOne' | 'create' | 'save' | 'delete' | 'update'>>;

  const mockBeneficiary = (overrides: Partial<Beneficiary> = {}): Beneficiary =>
    ({
      id: 'ben-1',
      userId: 'user-1',
      alias: 'My Wallet',
      address: 'GABCD...1234',
      currency: 'XLM',
      network: 'stellar',
      isVerified: false,
      lastUsedAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      ...overrides,
    }) as Beneficiary;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto as Beneficiary),
      save: jest.fn((e) => Promise.resolve({ id: 'ben-new', ...e })),
      delete: jest.fn(),
      update: jest.fn(),
    };
    service = new BeneficiariesService(repo as unknown as Repository<Beneficiary>);
  });

  describe('create', () => {
    it('creates a beneficiary', async () => {
      const dto = { userId: 'user-1', alias: 'My Wallet', address: 'GABCD...1234', currency: 'XLM' };
      const result = await service.create(dto);
      expect(result).toMatchObject(dto);
      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns beneficiaries ordered by lastUsedAt desc', async () => {
      repo.find.mockResolvedValue([mockBeneficiary(), mockBeneficiary()]);
      const result = await service.findAll('user-1');
      expect(result).toHaveLength(2);
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { lastUsedAt: 'DESC', createdAt: 'DESC' },
      });
    });
  });

  describe('findById', () => {
    it('returns a beneficiary when found', async () => {
      repo.findOne.mockResolvedValue(mockBeneficiary());
      const result = await service.findById('ben-1', 'user-1');
      expect(result.id).toBe('ben-1');
    });

    it('throws when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById('ben-1', 'user-1')).rejects.toThrow('Beneficiary not found');
    });
  });

  describe('update', () => {
    it('updates a beneficiary', async () => {
      repo.findOne.mockResolvedValue(mockBeneficiary());
      repo.save.mockResolvedValue(mockBeneficiary({ alias: 'Updated' }));
      const result = await service.update('ben-1', 'user-1', { alias: 'Updated' });
      expect(result.alias).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('deletes a beneficiary', async () => {
      repo.delete.mockResolvedValue({ affected: 1, raw: {} });
      await expect(service.remove('ben-1', 'user-1')).resolves.not.toThrow();
      expect(repo.delete).toHaveBeenCalledWith({ id: 'ben-1', userId: 'user-1' });
    });

    it('throws when beneficiary not found', async () => {
      repo.delete.mockResolvedValue({ affected: 0, raw: {} });
      await expect(service.remove('ben-1', 'user-1')).rejects.toThrow('Beneficiary not found');
    });
  });

  describe('updateLastUsed', () => {
    it('updates the lastUsedAt timestamp', async () => {
      await service.updateLastUsed('ben-1', 'user-1');
      expect(repo.update).toHaveBeenCalledWith({ id: 'ben-1', userId: 'user-1' }, { lastUsedAt: expect.any(Date) });
    });
  });

  describe('findByAddressAndCurrency', () => {
    it('finds a beneficiary by address and currency', async () => {
      repo.findOne.mockResolvedValue(mockBeneficiary());
      const result = await service.findByAddressAndCurrency('user-1', 'GABCD...1234', 'XLM');
      expect(result).not.toBeNull();
      expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: 'user-1', address: 'GABCD...1234', currency: 'XLM' } });
    });
  });
});
