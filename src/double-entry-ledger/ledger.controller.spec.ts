import { Test, TestingModule } from '@nestjs/testing';
import { LedgerController } from '../src/ledger/ledger.controller';
import { LedgerService } from '../src/ledger/ledger.service';
import { EntryType } from '../src/ledger/entities/ledger-entry.entity';
import {
  CreateDoubleEntryDto,
  ReconciliationResultDto,
  LedgerBalanceDto,
} from '../src/ledger/dto/ledger.dto';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';

const mockLedgerService = {
  postDoubleEntry: jest.fn(),
  reconcile: jest.fn(),
  runIntegrityValidation: jest.fn(),
  getEntriesByTransaction: jest.fn(),
  verifyTransactionIntegrity: jest.fn(),
  getAccountBalance: jest.fn(),
};

describe('LedgerController', () => {
  let controller: LedgerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LedgerController],
      providers: [{ provide: LedgerService, useValue: mockLedgerService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LedgerController>(LedgerController);
    jest.clearAllMocks();
  });

  describe('postDoubleEntry', () => {
    it('should call service and return entries', async () => {
      const dto: CreateDoubleEntryDto = {
        transactionId: 'tx-001',
        entries: [
          { accountId: 'acc-001', debit: 100, credit: 0, entryType: EntryType.DEBIT, currency: 'USD' },
          { accountId: 'acc-002', debit: 0, credit: 100, entryType: EntryType.CREDIT, currency: 'USD' },
        ],
      };
      const mockResult = [{ id: 'entry-001' }, { id: 'entry-002' }];
      mockLedgerService.postDoubleEntry.mockResolvedValue(mockResult);

      const result = await controller.postDoubleEntry(dto);

      expect(mockLedgerService.postDoubleEntry).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('reconcile', () => {
    it('should return reconciliation result', async () => {
      const mockResult: ReconciliationResultDto = {
        isBalanced: true,
        totalDebits: 1000,
        totalCredits: 1000,
        discrepancy: 0,
        entriesChecked: 20,
        currency: 'USD',
        checkedAt: new Date(),
      };
      mockLedgerService.reconcile.mockResolvedValue(mockResult);

      const result = await controller.reconcile({ currency: 'USD' });

      expect(mockLedgerService.reconcile).toHaveBeenCalledWith({ currency: 'USD' });
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('runIntegrityValidation', () => {
    it('should return integrity check results', async () => {
      const mockResult = { checked: 50, failed: [] };
      mockLedgerService.runIntegrityValidation.mockResolvedValue(mockResult);

      const result = await controller.runIntegrityValidation();
      expect(result.checked).toBe(50);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('getEntriesByTransaction', () => {
    it('should return entries for a transaction', async () => {
      const entries = [{ id: 'entry-001' }, { id: 'entry-002' }];
      mockLedgerService.getEntriesByTransaction.mockResolvedValue(entries);

      const result = await controller.getEntriesByTransaction('tx-001');

      expect(mockLedgerService.getEntriesByTransaction).toHaveBeenCalledWith('tx-001');
      expect(result).toHaveLength(2);
    });
  });

  describe('verifyTransactionIntegrity', () => {
    it('should return valid status for a healthy transaction', async () => {
      mockLedgerService.verifyTransactionIntegrity.mockResolvedValue(true);

      const result = await controller.verifyTransactionIntegrity('tx-001');

      expect(result).toEqual({ transactionId: 'tx-001', isValid: true });
    });

    it('should return invalid status for a tampered transaction', async () => {
      mockLedgerService.verifyTransactionIntegrity.mockResolvedValue(false);

      const result = await controller.verifyTransactionIntegrity('tx-bad');

      expect(result.isValid).toBe(false);
    });
  });

  describe('getAccountBalance', () => {
    it('should return balance for an account', async () => {
      const mockBalance: LedgerBalanceDto = {
        accountId: 'acc-001',
        currency: 'USD',
        computedBalance: 500,
        storedBalance: 500,
        isConsistent: true,
        lastEntryAt: new Date(),
      };
      mockLedgerService.getAccountBalance.mockResolvedValue(mockBalance);

      const result = await controller.getAccountBalance('acc-001', 'USD');

      expect(result.isConsistent).toBe(true);
      expect(result.computedBalance).toBe(500);
    });
  });
});
