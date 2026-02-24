import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LedgerService } from '../src/ledger/ledger.service';
import { LedgerEntry, EntryType } from '../src/ledger/entities/ledger-entry.entity';
import { LedgerAccount, AccountType } from '../src/ledger/entities/ledger-account.entity';
import { CreateDoubleEntryDto } from '../src/ledger/dto/ledger.dto';

// ─── Test Factories ───────────────────────────────────────────────────────────

const makeAccount = (overrides?: Partial<LedgerAccount>): LedgerAccount => ({
  id: 'acc-001',
  userId: 'user-001',
  accountType: AccountType.ASSET,
  currency: 'USD',
  name: 'Test Account',
  derivedBalance: 0,
  isSystemAccount: false,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeEntry = (overrides?: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'entry-001',
  transactionId: 'tx-001',
  accountId: 'acc-001',
  debit: 100,
  credit: 0,
  currency: 'USD',
  entryType: EntryType.DEBIT,
  description: 'Test',
  metadata: {},
  checksum: 'abc123',
  timestamp: new Date(),
  preventUpdate: jest.fn(),
  preventDelete: jest.fn(),
  ...overrides,
});

const makeDoubleEntryDto = (overrides?: Partial<CreateDoubleEntryDto>): CreateDoubleEntryDto => ({
  transactionId: 'tx-001',
  entries: [
    {
      accountId: 'acc-001',
      debit: 100,
      credit: 0,
      entryType: EntryType.DEBIT,
      currency: 'USD',
      description: 'Debit entry',
    },
    {
      accountId: 'acc-002',
      debit: 0,
      credit: 100,
      entryType: EntryType.CREDIT,
      currency: 'USD',
      description: 'Credit entry',
    },
  ],
  ...overrides,
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockQueryRunner = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  },
} as unknown as QueryRunner;

const mockDataSource = {
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
} as unknown as DataSource;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LedgerService', () => {
  let service: LedgerService;
  let ledgerEntryRepo: jest.Mocked<Repository<LedgerEntry>>;
  let ledgerAccountRepo: jest.Mocked<Repository<LedgerAccount>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        {
          provide: getRepositoryToken(LedgerEntry),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LedgerAccount),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
    ledgerEntryRepo = module.get(getRepositoryToken(LedgerEntry));
    ledgerAccountRepo = module.get(getRepositoryToken(LedgerAccount));

    jest.clearAllMocks();
  });

  // ─── postDoubleEntry ───────────────────────────────────────────────────────

  describe('postDoubleEntry', () => {
    it('should post a balanced double-entry successfully', async () => {
      const dto = makeDoubleEntryDto();
      const acc1 = makeAccount({ id: 'acc-001' });
      const acc2 = makeAccount({ id: 'acc-002' });

      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce(acc1) // account lookup 1
        .mockResolvedValueOnce(acc2); // account lookup 2

      (mockQueryRunner.manager.create as jest.Mock).mockImplementation((_, data) => ({ ...data, checksum: '' }));
      (mockQueryRunner.manager.save as jest.Mock)
        .mockResolvedValueOnce(acc1)
        .mockResolvedValueOnce(acc2)
        .mockResolvedValueOnce([makeEntry(), makeEntry({ id: 'entry-002', entryType: EntryType.CREDIT })]);

      const result = await service.postDoubleEntry(dto);

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw ConflictException for duplicate transaction', async () => {
      const dto = makeDoubleEntryDto();
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce(makeEntry()); // existing entry found

      await expect(service.postDoubleEntry(dto)).rejects.toThrow(ConflictException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException when debits != credits', async () => {
      const dto = makeDoubleEntryDto({
        entries: [
          { accountId: 'acc-001', debit: 100, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
          { accountId: 'acc-002', debit: 0, credit: 90, entryType: EntryType.CREDIT, currency: 'USD' }, // MISMATCH
        ],
      });

      await expect(service.postDoubleEntry(dto)).rejects.toThrow(BadRequestException);
      await expect(service.postDoubleEntry(dto)).rejects.toThrow(/Unbalanced transaction/);
    });

    it('should throw BadRequestException for negative amounts', async () => {
      const dto = makeDoubleEntryDto({
        entries: [
          { accountId: 'acc-001', debit: -100, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
          { accountId: 'acc-002', debit: 0, credit: -100, entryType: EntryType.CREDIT, currency: 'USD' },
        ],
      });

      await expect(service.postDoubleEntry(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when an entry has both debit and credit', async () => {
      const dto = makeDoubleEntryDto({
        entries: [
          { accountId: 'acc-001', debit: 100, credit: 100, entryType: EntryType.DEBIT, currency: 'USD' },
          { accountId: 'acc-002', debit: 0, credit: 0, entryType: EntryType.CREDIT, currency: 'USD' },
        ],
      });

      await expect(service.postDoubleEntry(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when account does not exist', async () => {
      const dto = makeDoubleEntryDto();

      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // no existing entries
        .mockResolvedValueOnce(null); // account not found

      await expect(service.postDoubleEntry(dto)).rejects.toThrow(NotFoundException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException on currency mismatch', async () => {
      const dto = makeDoubleEntryDto({
        entries: [
          { accountId: 'acc-001', debit: 100, credit: 0, entryType: EntryType.DEBIT, currency: 'EUR' },
          { accountId: 'acc-002', debit: 0, credit: 100, entryType: EntryType.CREDIT, currency: 'EUR' },
        ],
      });

      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce(makeAccount({ currency: 'USD' })); // account currency is USD, not EUR

      await expect(service.postDoubleEntry(dto)).rejects.toThrow(BadRequestException);
      await expect(service.postDoubleEntry(dto)).rejects.toThrow(/Currency mismatch/);
    });

    it('should handle multiple currencies in a single transaction', async () => {
      const dto = makeDoubleEntryDto({
        entries: [
          { accountId: 'acc-001', debit: 100, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
          { accountId: 'acc-002', debit: 0, credit: 100, entryType: EntryType.CREDIT, currency: 'USD' },
          { accountId: 'acc-003', debit: 50, credit: 0, entryType: EntryType.DEBIT, currency: 'EUR' },
          { accountId: 'acc-004', debit: 0, credit: 50, entryType: EntryType.CREDIT, currency: 'EUR' },
        ],
      });

      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeAccount({ id: 'acc-001', currency: 'USD' }))
        .mockResolvedValueOnce(makeAccount({ id: 'acc-002', currency: 'USD' }))
        .mockResolvedValueOnce(makeAccount({ id: 'acc-003', currency: 'EUR' }))
        .mockResolvedValueOnce(makeAccount({ id: 'acc-004', currency: 'EUR' }));

      (mockQueryRunner.manager.create as jest.Mock).mockImplementation((_, data) => ({ ...data, checksum: '' }));
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue([]);

      await service.postDoubleEntry(dto);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should rollback on unexpected error', async () => {
      const dto = makeDoubleEntryDto();

      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.postDoubleEntry(dto)).rejects.toThrow();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ─── reconcile ─────────────────────────────────────────────────────────────

  describe('reconcile', () => {
    const mockQb = () => {
      const qb: any = {
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
        getRawMany: jest.fn(),
      };
      return qb;
    };

    it('should return balanced result when debits == credits', async () => {
      const qb = mockQb();
      qb.getRawOne.mockResolvedValue({ totalDebits: '1000', totalCredits: '1000', count: '10' });
      ledgerEntryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.reconcile({ currency: 'USD' });

      expect(result.isBalanced).toBe(true);
      expect(result.discrepancy).toBe(0);
      expect(result.entriesChecked).toBe(10);
    });

    it('should return imbalanced result and list discrepant transactions', async () => {
      const mainQb = mockQb();
      const discrepantQb = mockQb();

      mainQb.getRawOne.mockResolvedValue({ totalDebits: '1000', totalCredits: '900', count: '10' });
      discrepantQb.getRawMany.mockResolvedValue([{ transactionId: 'tx-bad-001' }]);

      ledgerEntryRepo.createQueryBuilder = jest.fn()
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(discrepantQb);

      const result = await service.reconcile({});

      expect(result.isBalanced).toBe(false);
      expect(result.discrepancy).toBeCloseTo(100);
      expect(result.discrepantTransactions).toContain('tx-bad-001');
    });

    it('should handle empty ledger gracefully', async () => {
      const qb = mockQb();
      qb.getRawOne.mockResolvedValue({ totalDebits: null, totalCredits: null, count: '0' });
      ledgerEntryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.reconcile({});

      expect(result.isBalanced).toBe(true);
      expect(result.entriesChecked).toBe(0);
    });
  });

  // ─── verifyTransactionIntegrity ───────────────────────────────────────────

  describe('verifyTransactionIntegrity', () => {
    it('should return true for a valid balanced transaction', async () => {
      const entries = [
        makeEntry({ debit: 100, credit: 0, entryType: EntryType.DEBIT }),
        makeEntry({ id: 'entry-002', debit: 0, credit: 100, entryType: EntryType.CREDIT }),
      ];

      // Compute real checksums
      (service as any).computeChecksum = jest.fn()
        .mockReturnValueOnce(entries[0].checksum) // verification call
        .mockReturnValueOnce(entries[1].checksum);

      ledgerEntryRepo.find = jest.fn().mockResolvedValue(entries);

      // Restore real checksum fn for this test
      const realService = new LedgerService(
        ledgerEntryRepo as any,
        ledgerAccountRepo as any,
        mockDataSource,
      );
      const withRealChecksums = entries.map((e) => ({
        ...e,
        checksum: (realService as any).computeChecksum(e),
      }));
      ledgerEntryRepo.find = jest.fn().mockResolvedValue(withRealChecksums);

      const result = await realService.verifyTransactionIntegrity('tx-001');
      expect(result).toBe(true);
    });

    it('should return true for empty transaction (no entries)', async () => {
      ledgerEntryRepo.find = jest.fn().mockResolvedValue([]);
      const result = await service.verifyTransactionIntegrity('tx-unknown');
      expect(result).toBe(true);
    });

    it('should return false when checksum is tampered', async () => {
      const entries = [
        makeEntry({ debit: 100, credit: 0, checksum: 'tampered-checksum' }),
        makeEntry({ id: 'entry-002', debit: 0, credit: 100, checksum: 'another-tampered' }),
      ];
      ledgerEntryRepo.find = jest.fn().mockResolvedValue(entries);

      const result = await service.verifyTransactionIntegrity('tx-001');
      expect(result).toBe(false);
    });

    it('should return false when transaction is unbalanced', async () => {
      const realService = new LedgerService(
        ledgerEntryRepo as any,
        ledgerAccountRepo as any,
        mockDataSource,
      );

      const entries = [
        makeEntry({ debit: 100, credit: 0 }),
        makeEntry({ id: 'entry-002', debit: 0, credit: 50 }), // intentionally unbalanced
      ];
      // Set real checksums so checksum validation passes
      entries[0].checksum = (realService as any).computeChecksum(entries[0]);
      entries[1].checksum = (realService as any).computeChecksum(entries[1]);

      ledgerEntryRepo.find = jest.fn().mockResolvedValue(entries);

      const result = await realService.verifyTransactionIntegrity('tx-001');
      expect(result).toBe(false);
    });
  });

  // ─── getAccountBalance ─────────────────────────────────────────────────────

  describe('getAccountBalance', () => {
    it('should return consistent balance when ledger and stored values match', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalDebits: '100',
          totalCredits: '200',
          lastEntry: new Date().toISOString(),
        }),
      };
      ledgerEntryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      ledgerAccountRepo.findOne = jest.fn().mockResolvedValue(makeAccount({ derivedBalance: 100 }));

      const result = await service.getAccountBalance('acc-001', 'USD');

      expect(result.computedBalance).toBe(100); // 200 - 100
      expect(result.isConsistent).toBe(true);
    });

    it('should flag inconsistency when computed balance differs from stored', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalDebits: '100',
          totalCredits: '250', // computed = 150
          lastEntry: new Date().toISOString(),
        }),
      };
      ledgerEntryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      ledgerAccountRepo.findOne = jest.fn().mockResolvedValue(makeAccount({ derivedBalance: 100 })); // stored = 100

      const result = await service.getAccountBalance('acc-001', 'USD');

      expect(result.isConsistent).toBe(false);
      expect(result.computedBalance).toBe(150);
      expect(result.storedBalance).toBe(100);
    });
  });

  // ─── runIntegrityValidation ───────────────────────────────────────────────

  describe('runIntegrityValidation', () => {
    it('should return all failed transactions', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { transactionId: 'tx-001' },
          { transactionId: 'tx-002' },
        ]),
      };
      ledgerEntryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      jest.spyOn(service, 'verifyTransactionIntegrity')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.runIntegrityValidation();

      expect(result.checked).toBe(2);
      expect(result.failed).toEqual(['tx-002']);
    });

    it('should return empty failed list when all transactions are valid', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ transactionId: 'tx-001' }]),
      };
      ledgerEntryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      jest.spyOn(service, 'verifyTransactionIntegrity').mockResolvedValue(true);

      const result = await service.runIntegrityValidation();
      expect(result.failed).toHaveLength(0);
    });
  });
});
