/**
 * Financial Consistency Tests
 *
 * These tests verify the core accounting invariants of the double-entry ledger:
 *   1. Every transaction must have equal debits and credits
 *   2. Balances must be derived exclusively from ledger entries
 *   3. Ledger entries must be immutable
 *   4. Reconciliation must detect any discrepancies
 *   5. Checksums must catch tampering
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { LedgerModule } from '../src/ledger/ledger.module';
import { LedgerService } from '../src/ledger/ledger.service';
import { LedgerEntry, EntryType } from '../src/ledger/entities/ledger-entry.entity';
import { LedgerAccount, AccountType } from '../src/ledger/entities/ledger-account.entity';

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

const buildAccount = (id: string, currency = 'USD', balance = 0): LedgerAccount => ({
  id,
  userId: 'user-001',
  accountType: AccountType.ASSET,
  currency,
  name: `Account ${id}`,
  derivedBalance: balance,
  isSystemAccount: false,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const buildEntry = (
  id: string,
  txId: string,
  accountId: string,
  debit: number,
  credit: number,
  entryType: EntryType,
  currency = 'USD',
): LedgerEntry => ({
  id,
  transactionId: txId,
  accountId,
  debit,
  credit,
  currency,
  entryType,
  description: null,
  metadata: null,
  checksum: 'placeholder',
  timestamp: new Date(),
  preventUpdate: jest.fn(),
  preventDelete: jest.fn(),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Financial Consistency Tests (LedgerService)', () => {
  let service: LedgerService;

  const mockQr = {
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

  const mockDs = { createQueryRunner: jest.fn().mockReturnValue(mockQr) } as unknown as DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        {
          provide: getRepositoryToken(LedgerEntry),
          useValue: { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(LedgerAccount),
          useValue: { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() },
        },
        { provide: DataSource, useValue: mockDs },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
    jest.clearAllMocks();
  });

  // ─── Invariant 1: Accounting Equation ─────────────────────────────────────

  describe('Invariant 1: Debits must equal credits per currency', () => {
    it('rejects transactions where total debits exceed credits', async () => {
      await expect(
        service.postDoubleEntry({
          transactionId: 'tx-inv1a',
          entries: [
            { accountId: 'acc-1', debit: 200, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
            { accountId: 'acc-2', debit: 0, credit: 100, entryType: EntryType.CREDIT, currency: 'USD' },
          ],
        }),
      ).rejects.toThrow(/Unbalanced transaction/);
    });

    it('rejects transactions where total credits exceed debits', async () => {
      await expect(
        service.postDoubleEntry({
          transactionId: 'tx-inv1b',
          entries: [
            { accountId: 'acc-1', debit: 50, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
            { accountId: 'acc-2', debit: 0, credit: 100, entryType: EntryType.CREDIT, currency: 'USD' },
          ],
        }),
      ).rejects.toThrow(/Unbalanced transaction/);
    });

    it('accepts a perfectly balanced transaction', async () => {
      const acc1 = buildAccount('acc-1');
      const acc2 = buildAccount('acc-2');

      (mockQr.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(acc1)
        .mockResolvedValueOnce(acc2);
      (mockQr.manager.create as jest.Mock).mockImplementation((_, d) => ({ ...d, checksum: '' }));
      (mockQr.manager.save as jest.Mock).mockResolvedValue([]);

      await expect(
        service.postDoubleEntry({
          transactionId: 'tx-inv1c',
          entries: [
            { accountId: 'acc-1', debit: 100, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
            { accountId: 'acc-2', debit: 0, credit: 100, entryType: EntryType.CREDIT, currency: 'USD' },
          ],
        }),
      ).resolves.not.toThrow();
    });

    it('handles floating-point precision correctly (99.99 + 0.01 = 100)', async () => {
      const acc1 = buildAccount('acc-1');
      const acc2 = buildAccount('acc-2');
      const acc3 = buildAccount('acc-3');

      (mockQr.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(acc1)
        .mockResolvedValueOnce(acc2)
        .mockResolvedValueOnce(acc3);
      (mockQr.manager.create as jest.Mock).mockImplementation((_, d) => ({ ...d, checksum: '' }));
      (mockQr.manager.save as jest.Mock).mockResolvedValue([]);

      await expect(
        service.postDoubleEntry({
          transactionId: 'tx-inv1d',
          entries: [
            { accountId: 'acc-1', debit: 100, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
            { accountId: 'acc-2', debit: 0, credit: 99.99, entryType: EntryType.CREDIT, currency: 'USD' },
            { accountId: 'acc-3', debit: 0, credit: 0.01, entryType: EntryType.CREDIT, currency: 'USD' },
          ],
        }),
      ).resolves.not.toThrow();
    });
  });

  // ─── Invariant 2: Balance Derivation ──────────────────────────────────────

  describe('Invariant 2: Balances must be derived from ledger entries', () => {
    it('computes balance as sum(credits) - sum(debits) from entries', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalDebits: '300',
          totalCredits: '500',
          lastEntry: new Date().toISOString(),
        }),
      };
      const entryRepo = (service as any).ledgerEntryRepo;
      entryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const accountRepo = (service as any).ledgerAccountRepo;
      accountRepo.findOne = jest.fn().mockResolvedValue(buildAccount('acc-1', 'USD', 200));

      const balance = await service.getAccountBalance('acc-1', 'USD');

      expect(balance.computedBalance).toBe(200); // 500 - 300
      expect(balance.storedBalance).toBe(200);
      expect(balance.isConsistent).toBe(true);
    });

    it('detects stale/incorrect stored balance vs computed', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalDebits: '100',
          totalCredits: '400', // computed = 300
          lastEntry: new Date().toISOString(),
        }),
      };
      const entryRepo = (service as any).ledgerEntryRepo;
      entryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const accountRepo = (service as any).ledgerAccountRepo;
      accountRepo.findOne = jest.fn().mockResolvedValue(buildAccount('acc-1', 'USD', 150)); // stored = 150

      const balance = await service.getAccountBalance('acc-1', 'USD');

      expect(balance.isConsistent).toBe(false);
      expect(balance.computedBalance).toBe(300);
      expect(balance.storedBalance).toBe(150);
    });
  });

  // ─── Invariant 3: Immutability ─────────────────────────────────────────────

  describe('Invariant 3: Ledger entries must be immutable', () => {
    it('throws when BeforeUpdate hook is triggered', () => {
      const entry = buildEntry('e-1', 'tx-1', 'acc-1', 100, 0, EntryType.DEBIT);
      expect(() => entry.preventUpdate()).toThrow(/immutable/);
    });

    it('throws when BeforeRemove hook is triggered', () => {
      const entry = buildEntry('e-1', 'tx-1', 'acc-1', 100, 0, EntryType.DEBIT);
      expect(() => entry.preventDelete()).toThrow(/immutable/);
    });

    it('rejects duplicate postings via idempotency check', async () => {
      (mockQr.manager.findOne as jest.Mock).mockResolvedValueOnce(
        buildEntry('e-1', 'tx-dup', 'acc-1', 100, 0, EntryType.DEBIT),
      );

      await expect(
        service.postDoubleEntry({
          transactionId: 'tx-dup',
          entries: [
            { accountId: 'acc-1', debit: 100, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
            { accountId: 'acc-2', debit: 0, credit: 100, entryType: EntryType.CREDIT, currency: 'USD' },
          ],
        }),
      ).rejects.toThrow(/already been posted/);
    });
  });

  // ─── Invariant 4: Reconciliation ──────────────────────────────────────────

  describe('Invariant 4: Reconciliation detects discrepancies', () => {
    it('confirms balance when a complete journal has equal debits/credits', async () => {
      const qb: any = {
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalDebits: '5000', totalCredits: '5000', count: '40' }),
      };
      const entryRepo = (service as any).ledgerEntryRepo;
      entryRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.reconcile({});
      expect(result.isBalanced).toBe(true);
    });

    it('reports imbalance and finds offending transactions', async () => {
      const mainQb: any = {
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalDebits: '5010', totalCredits: '5000', count: '40' }),
      };
      const discQb: any = {
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ transactionId: 'tx-corrupt' }]),
      };

      const entryRepo = (service as any).ledgerEntryRepo;
      entryRepo.createQueryBuilder = jest.fn()
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(discQb);

      const result = await service.reconcile({});

      expect(result.isBalanced).toBe(false);
      expect(result.discrepancy).toBeCloseTo(10);
      expect(result.discrepantTransactions).toContain('tx-corrupt');
    });
  });

  // ─── Invariant 5: Checksum Integrity ─────────────────────────────────────

  describe('Invariant 5: Checksum detects data tampering', () => {
    it('verifies a correctly checksummed entry as valid', async () => {
      const realService = new LedgerService(
        (service as any).ledgerEntryRepo,
        (service as any).ledgerAccountRepo,
        mockDs,
      );

      const entryData = buildEntry('e-1', 'tx-001', 'acc-1', 100, 0, EntryType.DEBIT);
      entryData.checksum = (realService as any).computeChecksum(entryData);

      const creditEntry = buildEntry('e-2', 'tx-001', 'acc-2', 0, 100, EntryType.CREDIT);
      creditEntry.checksum = (realService as any).computeChecksum(creditEntry);

      const entryRepo = (realService as any).ledgerEntryRepo;
      entryRepo.find = jest.fn().mockResolvedValue([entryData, creditEntry]);

      const result = await realService.verifyTransactionIntegrity('tx-001');
      expect(result).toBe(true);
    });

    it('detects a tampered amount in a ledger entry', async () => {
      const realService = new LedgerService(
        (service as any).ledgerEntryRepo,
        (service as any).ledgerAccountRepo,
        mockDs,
      );

      const entryData = buildEntry('e-1', 'tx-001', 'acc-1', 100, 0, EntryType.DEBIT);
      entryData.checksum = (realService as any).computeChecksum(entryData);

      // Simulate tampering: change amount after checksum was computed
      entryData.debit = 999;

      const entryRepo = (realService as any).ledgerEntryRepo;
      entryRepo.find = jest.fn().mockResolvedValue([entryData]);

      const result = await realService.verifyTransactionIntegrity('tx-001');
      expect(result).toBe(false);
    });
  });
});
