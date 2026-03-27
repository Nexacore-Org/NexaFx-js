import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { ReconciliationProcessor } from './reconciliation.processor';
import { QUEUE_NAMES, JOB_NAMES } from './queue.constants';
import { ReconciliationService } from '../modules/reconciliation/services/reconciliation.service';
import { WalletService } from '../modules/users/wallet.service';
import { LedgerService } from '../double-entry-ledger/ledger.service';

const makeJob = (name: string, data: Record<string, unknown>, overrides: Partial<Job> = {}): Partial<Job> => ({
  id: 'rec-job-1',
  name,
  data,
  attemptsMade: 0,
  opts: { attempts: 3 },
  updateProgress: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('ReconciliationProcessor', () => {
  let processor: ReconciliationProcessor;
  let dlqQueue: jest.Mocked<Partial<Queue>>;
  let reconciliationService: jest.Mocked<Partial<ReconciliationService>>;
  let walletService: jest.Mocked<Partial<WalletService>>;
  let ledgerService: jest.Mocked<Partial<LedgerService>>;

  beforeEach(async () => {
    dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'dlq-1' }) };

    reconciliationService = {
      runReconciliation: jest.fn().mockResolvedValue(undefined),
      getIssues: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 1000, total: 0, totalPages: 0 },
      }),
    };

    walletService = {
      getWalletsByUser: jest.fn().mockResolvedValue([]),
    };

    ledgerService = {
      runIntegrityValidation: jest.fn().mockResolvedValue({ checked: 10, failed: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationProcessor,
        { provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER), useValue: dlqQueue },
        { provide: ReconciliationService, useValue: reconciliationService },
        { provide: WalletService, useValue: walletService },
        { provide: LedgerService, useValue: ledgerService },
      ],
    }).compile();

    processor = module.get<ReconciliationProcessor>(ReconciliationProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('should reconcile transactions and report progress', async () => {
      const job = makeJob(JOB_NAMES.RECONCILE_TRANSACTIONS, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        idempotencyKey: 'idem-rec-tx',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ reconciled: true, discrepancies: 0 });
      expect(reconciliationService.runReconciliation).toHaveBeenCalledTimes(1);
      expect(job.updateProgress).toHaveBeenCalledTimes(3);
    });

    it('should reconcile balances', async () => {
      (walletService.getWalletsByUser as jest.Mock).mockResolvedValue([
        { id: 'w-1', availableBalance: 100 },
      ]);

      const job = makeJob(JOB_NAMES.RECONCILE_BALANCES, {
        accountIds: ['acc-1', 'acc-2'],
        asOfDate: '2024-01-31',
        idempotencyKey: 'idem-rec-bal',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ reconciled: true, mismatchCount: 0 });
      expect(walletService.getWalletsByUser).toHaveBeenCalledTimes(2);
    });

    it('should detect balance mismatches', async () => {
      (walletService.getWalletsByUser as jest.Mock).mockResolvedValue([
        { id: 'w-bad', availableBalance: -50 },
      ]);

      const job = makeJob(JOB_NAMES.RECONCILE_BALANCES, {
        accountIds: ['acc-bad'],
        asOfDate: '2024-01-31',
        idempotencyKey: 'idem-rec-bal-bad',
      });

      const result = await processor.process(job as Job);
      expect((result.data as any).mismatchCount).toBe(1);
    });

    it('should reconcile ledger', async () => {
      const job = makeJob(JOB_NAMES.RECONCILE_LEDGER, {
        ledgerId: 'ledger-1',
        period: '2024-Q1',
        idempotencyKey: 'idem-rec-ledger',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ reconciled: true, entriesVerified: 10 });
      expect(ledgerService.runIntegrityValidation).toHaveBeenCalledTimes(1);
    });

    it('should mark ledger as not reconciled when integrity fails', async () => {
      (ledgerService.runIntegrityValidation as jest.Mock).mockResolvedValue({
        checked: 5,
        failed: ['tx-bad-1'],
      });

      const job = makeJob(JOB_NAMES.RECONCILE_LEDGER, {
        ledgerId: 'ledger-2',
        period: '2024-Q2',
        idempotencyKey: 'idem-rec-ledger-fail',
      });

      const result = await processor.process(job as Job);
      expect((result.data as any).reconciled).toBe(false);
      expect((result.data as any).failedTransactions).toEqual(['tx-bad-1']);
    });

    it('should throw for unknown job name', async () => {
      const job = makeJob('unknown', { idempotencyKey: 'idem-unk' });
      await expect(processor.process(job as Job)).rejects.toThrow('Unknown reconciliation job');
    });
  });

  describe('onFailed', () => {
    it('should send to DLQ when all attempts exhausted', async () => {
      const job = makeJob(
        JOB_NAMES.RECONCILE_TRANSACTIONS,
        { idempotencyKey: 'idem-fail' },
        { attemptsMade: 3, opts: { attempts: 3 } },
      );

      await processor.onFailed(job as Job, new Error('db error'));
      expect(dlqQueue.add).toHaveBeenCalledWith(
        'process-dlq',
        expect.objectContaining({
          originalQueue: QUEUE_NAMES.RECONCILIATION,
          failureReason: 'db error',
        }),
        expect.any(Object),
      );
    });

    it('should not send to DLQ if retries remain', async () => {
      const job = makeJob(
        JOB_NAMES.RECONCILE_TRANSACTIONS,
        { idempotencyKey: 'idem-partial' },
        { attemptsMade: 1, opts: { attempts: 3 } },
      );

      await processor.onFailed(job as Job, new Error('temp'));
      expect(dlqQueue.add).not.toHaveBeenCalled();
    });
  });
});
