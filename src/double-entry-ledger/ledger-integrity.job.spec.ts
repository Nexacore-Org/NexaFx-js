import { Test, TestingModule } from '@nestjs/testing';
import { LedgerIntegrityJob } from '../src/ledger/jobs/ledger-integrity.job';
import { LedgerService } from '../src/ledger/ledger.service';

const mockLedgerService = {
  runIntegrityValidation: jest.fn(),
  reconcile: jest.fn(),
};

describe('LedgerIntegrityJob', () => {
  let job: LedgerIntegrityJob;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerIntegrityJob,
        { provide: LedgerService, useValue: mockLedgerService },
      ],
    }).compile();

    job = module.get<LedgerIntegrityJob>(LedgerIntegrityJob);
    jest.clearAllMocks();
  });

  describe('runIntegrityCheck', () => {
    it('should log success when no failures found', async () => {
      mockLedgerService.runIntegrityValidation.mockResolvedValue({ checked: 10, failed: [] });
      const logSpy = jest.spyOn(job['logger'], 'log').mockImplementation();

      await job.runIntegrityCheck();

      expect(mockLedgerService.runIntegrityValidation).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('10 transaction(s) verified'));
    });

    it('should log error when integrity failures found', async () => {
      mockLedgerService.runIntegrityValidation.mockResolvedValue({
        checked: 5,
        failed: ['tx-corrupt-001', 'tx-corrupt-002'],
      });
      const errorSpy = jest.spyOn(job['logger'], 'error').mockImplementation();

      await job.runIntegrityCheck();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('LEDGER INTEGRITY FAILURE'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('tx-corrupt-001'));
    });

    it('should log error on unexpected exception', async () => {
      mockLedgerService.runIntegrityValidation.mockRejectedValue(new Error('DB down'));
      const errorSpy = jest.spyOn(job['logger'], 'error').mockImplementation();

      await job.runIntegrityCheck();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('DB down'), undefined);
    });
  });

  describe('runDailyReconciliation', () => {
    it('should log success when ledger is balanced', async () => {
      mockLedgerService.reconcile.mockResolvedValue({
        isBalanced: true,
        totalDebits: 1000,
        totalCredits: 1000,
        entriesChecked: 20,
        discrepancy: 0,
      });
      const logSpy = jest.spyOn(job['logger'], 'log').mockImplementation();

      await job.runDailyReconciliation();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Daily reconciliation passed'));
    });

    it('should log error when ledger is not balanced', async () => {
      mockLedgerService.reconcile.mockResolvedValue({
        isBalanced: false,
        totalDebits: 1000,
        totalCredits: 900,
        entriesChecked: 20,
        discrepancy: 100,
      });
      const errorSpy = jest.spyOn(job['logger'], 'error').mockImplementation();

      await job.runDailyReconciliation();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('RECONCILIATION FAILURE'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('100'));
    });
  });
});
