import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerEntry, LedgerEntryType } from './ledger-entry.entity';
import { UsersService } from '../users/users.service';

describe('LedgerService', () => {
  let service: LedgerService;

  const mockLedgerRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entry) => Promise.resolve({ id: 'entry-1', ...entry, createdAt: new Date() })),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUsersService = {
    findById: jest.fn().mockResolvedValue({ id: 'user-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        { provide: getRepositoryToken(LedgerEntry), useValue: mockLedgerRepo },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
    jest.clearAllMocks();
  });

  it('should record a ledger entry', async () => {
    mockUsersService.findById.mockResolvedValueOnce({ id: 'user-1' });
    const dto = {
      userId: 'user-1',
      type: LedgerEntryType.CREDIT,
      amount: 100,
      currency: 'USD',
      balanceAfter: 100,
    };
    const res = await service.recordEntry(dto);
    expect(mockUsersService.findById).toHaveBeenCalledWith('user-1');
    expect(res.id).toBe('entry-1');
  });

  it('should throw NotFoundException if entry not found', async () => {
    mockLedgerRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
  });
});
