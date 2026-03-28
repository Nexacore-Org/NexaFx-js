import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { ReconciliationProcessor } from '../src/queue/reconciliation.processor';
import { DeadLetterProcessor } from '../src/queue/dead-letter.processor';
import { DeadLetterJobEntity } from '../src/queue/entities/dead-letter-job.entity';
import { DlqAlertingService } from '../src/queue/services/alerting.service';
import { ReconciliationService } from '../src/modules/reconciliation/services/reconciliation.service';
import { WalletService } from '../src/modules/users/wallet.service';
import { LedgerService } from '../src/double-entry-ledger/ledger.service';
import { QUEUE_NAMES, JOB_NAMES } from '../src/queue/queue.constants';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeJob = (
  name: string,
  data: Record<string, unknown>,
  overrides: Partial<Job> = {},
): Partial<Job> => ({
  id: `job-${Date.now()}`,
  name,
  data,
  attemptsMade: 0,
  opts: { attempts: 3 },
  updateProgress: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockReconciliationService = (): jest.Mocked<Partial<ReconciliationService>> => ({
  runReconciliation: jest.fn().mockResolvedValue(undefined),
  getIssues: jest.fn().mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 1000, total: 5, totalPages: 1 },
  }),
});

const mockWalletService = (): jest.Mocked<Partial<WalletService>> => ({
  getWalletsByUser: jest.fn().mockResolvedValue([]),
});

const mockLedgerService = (): jest.Mocked<Partial<LedgerService>> => ({
  runIntegrityValidation: jest.fn().mockResolvedValue({ checked: 20, failed: [] }),
});

const mockDlqQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'dlq-1' }) });

// ─── ReconciliationProcessor integration ─────────────────────────────────────

describe('ReconciliationProcessor (integration)', () => {
  let processor: ReconciliationProcessor;
  let reconciliationService: jest.Mocked<Partial<ReconciliationService>>;
  let walletService: jest.Mocked<Partial<WalletService>>;
  let ledgerService: jest.Mocked<Partial<LedgerService>>;
  let dlqQueue: ReturnType<typeof mockDlqQueue>;

  beforeEach(async () => {
    reconciliationService = mockReconciliationService();
    walletService = mockWalletService();
    ledgerService = mockLedgerService();
    dlqQueue = mockDlqQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationProcessor,
        { provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER), useValue: dlqQueue },
        { provide: ReconciliationService, useValue: reconciliationService },
        { provide: WalletService, useValue: walletService },
        { provide: LedgerService, useValue: ledgerService },
      ],
    }).compile();

    processor = module.get(ReconciliationProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  it('handleReconcileTransactions — calls runReconciliation and returns totals', async () => {
    (reconciliationService.getIssues as jest.Mock).mockResolvedValue({
      data: [{ status: 'ESCALATED' }, { status: 'AUTO_RESOLVED' }],
      meta: { total: 2 },
    });

    const job = makeJob(JOB_NAMES.RECONCILE_TRANSACTIONS, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      idempotencyKey: 'int-rec-tx',
    });

    const result = await processor.process(job as Job);

    expect(result.success).toBe(true);
    expect(reconciliationService.runReconciliation).toHaveBeenCalledTimes(1);
    expect((result.data as any).discrepancies).toBe(1);
    expect((result.data as any).totalProcessed).toBe(2);
    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).toHaveBeenCalledWith(60);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('handleReconcileBalances — detects negative balances as mismatches', async () => {
    (walletService.getWalletsByUser as jest.Mock)
      .mockResolvedValueOnce([{ id: 'w-1', availableBalance: -10 }])
      .mockResolvedValueOnce([{ id: 'w-2', availableBalance: 500 }]);

    const job = makeJob(JOB_NAMES.RECONCILE_BALANCES, {
      accountIds: ['acc-1', 'acc-2'],
      asOfDate: '2024-01-31',
      idempotencyKey: 'int-rec-bal',
    });

    const result = await processor.process(job as Job);

    expect(result.success).toBe(true);
    expect((result.data as any).mismatchCount).toBe(1);
    expect(walletService.getWalletsByUser).toHaveBeenCalledTimes(2);
  });

  it('handleReconcileLedger — calls runIntegrityValidation and maps result', async () => {
    (ledgerService.runIntegrityValidation as jest.Mock).mockResolvedValue({
      checked: 50,
      failed: ['tx-a', 'tx-b'],
    });

    const job = makeJob(JOB_NAMES.RECONCILE_LEDGER, {
      ledgerId: 'ledger-1',
      period: '2024-Q1',
      idempotencyKey: 'int-rec-ledger',
    });

    const result = await processor.process(job as Job);

    expect(result.success).toBe(true);
    expect((result.data as any).reconciled).toBe(false);
    expect((result.data as any).entriesVerified).toBe(50);
    expect((result.data as any).failedTransactions).toEqual(['tx-a', 'tx-b']);
  });

  it('is idempotent — running same job twice produces consistent results', async () => {
    const job = makeJob(JOB_NAMES.RECONCILE_TRANSACTIONS, {
      startDate: '2024-02-01',
      endDate: '2024-02-28',
      idempotencyKey: 'int-idem-tx',
    });

    const r1 = await processor.process(job as Job);
    const r2 = await processor.process(job as Job);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(reconciliationService.runReconciliation).toHaveBeenCalledTimes(2);
  });

  it('onFailed — routes to DLQ on final attempt', async () => {
    const job = makeJob(
      JOB_NAMES.RECONCILE_TRANSACTIONS,
      { idempotencyKey: 'int-fail' },
      { attemptsMade: 3, opts: { attempts: 3 } },
    );

    await processor.onFailed(job as Job, new Error('service unavailable'));

    expect(dlqQueue.add).toHaveBeenCalledWith(
      'process-dlq',
      expect.objectContaining({
        originalQueue: QUEUE_NAMES.RECONCILIATION,
        failureReason: 'service unavailable',
        attemptsMade: 3,
      }),
      expect.any(Object),
    );
  });

  it('onFailed — does not route to DLQ when retries remain', async () => {
    const job = makeJob(
      JOB_NAMES.RECONCILE_TRANSACTIONS,
      { idempotencyKey: 'int-retry' },
      { attemptsMade: 1, opts: { attempts: 3 } },
    );

    await processor.onFailed(job as Job, new Error('transient'));
    expect(dlqQueue.add).not.toHaveBeenCalled();
  });
});

// ─── DeadLetterProcessor integration ─────────────────────────────────────────

describe('DeadLetterProcessor (integration)', () => {
  let processor: DeadLetterProcessor;
  let dlqRepo: { save: jest.Mock; create: jest.Mock };
  let alertingService: { sendDlqAlert: jest.Mock };

  beforeEach(async () => {
    dlqRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue({ id: 'persisted-dlq-1' }),
    };
    alertingService = { sendDlqAlert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterProcessor,
        { provide: getRepositoryToken(DeadLetterJobEntity), useValue: dlqRepo },
        { provide: DlqAlertingService, useValue: alertingService },
      ],
    }).compile();

    processor = module.get(DeadLetterProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  it('persists dead-letter job to database', async () => {
    const failedAt = new Date().toISOString();
    const job = makeJob('process-dlq', {
      originalQueue: QUEUE_NAMES.RETRY_JOBS,
      originalJobName: JOB_NAMES.RETRY_PAYMENT,
      originalJobData: { transactionId: 'tx-123' },
      failureReason: 'gateway timeout',
      failedAt,
      attemptsMade: 5,
      idempotencyKey: 'int-dlq-persist',
    });

    const result = await processor.process(job as Job);

    expect(result.success).toBe(true);
    expect(dlqRepo.save).toHaveBeenCalledTimes(1);
    expect(dlqRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originalQueue: QUEUE_NAMES.RETRY_JOBS,
        originalJobName: JOB_NAMES.RETRY_PAYMENT,
        failureReason: 'gateway timeout',
        attemptsMade: 5,
        idempotencyKey: 'int-dlq-persist',
      }),
    );
  });

  it('triggers AlertingService on every DLQ entry', async () => {
    const job = makeJob('process-dlq', {
      originalQueue: QUEUE_NAMES.RECONCILIATION,
      originalJobName: JOB_NAMES.RECONCILE_LEDGER,
      originalJobData: {},
      failureReason: 'ledger locked',
      failedAt: new Date().toISOString(),
      attemptsMade: 3,
      idempotencyKey: 'int-dlq-alert',
    });

    await processor.process(job as Job);

    expect(alertingService.sendDlqAlert).toHaveBeenCalledTimes(1);
    expect(alertingService.sendDlqAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        originalQueue: QUEUE_NAMES.RECONCILIATION,
        originalJobName: JOB_NAMES.RECONCILE_LEDGER,
        failureReason: 'ledger locked',
      }),
    );
  });

  it('does not throw when persistence fails — logs and continues', async () => {
    dlqRepo.save.mockRejectedValue(new Error('DB unavailable'));

    const job = makeJob('process-dlq', {
      originalQueue: QUEUE_NAMES.FRAUD_SCORING,
      originalJobName: JOB_NAMES.SCORE_TRANSACTION,
      originalJobData: {},
      failureReason: 'model crash',
      failedAt: new Date().toISOString(),
      attemptsMade: 5,
      idempotencyKey: 'int-dlq-db-fail',
    });

    await expect(processor.process(job as Job)).resolves.toMatchObject({ success: true });
    expect(alertingService.sendDlqAlert).toHaveBeenCalledTimes(1);
  });

  it('does not throw when alerting fails — logs and continues', async () => {
    alertingService.sendDlqAlert.mockRejectedValue(new Error('notification service down'));

    const job = makeJob('process-dlq', {
      originalQueue: QUEUE_NAMES.WEBHOOK_DISPATCH,
      originalJobName: JOB_NAMES.DISPATCH_WEBHOOK,
      originalJobData: {},
      failureReason: 'endpoint unreachable',
      failedAt: new Date().toISOString(),
      attemptsMade: 8,
      idempotencyKey: 'int-dlq-alert-fail',
    });

    await expect(processor.process(job as Job)).resolves.toMatchObject({ success: true });
    expect(dlqRepo.save).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — processing same DLQ job twice persists twice without throwing', async () => {
    const jobData = {
      originalQueue: QUEUE_NAMES.RETRY_JOBS,
      originalJobName: JOB_NAMES.RETRY_TRANSFER,
      originalJobData: {},
      failureReason: 'bank offline',
      failedAt: new Date().toISOString(),
      attemptsMade: 5,
      idempotencyKey: 'int-dlq-idem',
    };

    const job = makeJob('process-dlq', jobData);

    await processor.process(job as Job);
    await processor.process(job as Job);

    expect(dlqRepo.save).toHaveBeenCalledTimes(2);
    expect(alertingService.sendDlqAlert).toHaveBeenCalledTimes(2);
  });
});
