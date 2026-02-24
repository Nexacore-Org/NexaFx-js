import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ReconciliationProcessor } from '../../src/queue/processors/reconciliation.processor';
import { QUEUE_NAMES, JOB_NAMES } from '../../src/queue/queue.constants';

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

  beforeEach(async () => {
    dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'dlq-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationProcessor,
        { provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER), useValue: dlqQueue },
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
      expect(job.updateProgress).toHaveBeenCalledTimes(3);
    });

    it('should reconcile balances', async () => {
      const job = makeJob(JOB_NAMES.RECONCILE_BALANCES, {
        accountIds: ['acc-1', 'acc-2'],
        asOfDate: '2024-01-31',
        idempotencyKey: 'idem-rec-bal',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ reconciled: true, mismatchCount: 0 });
    });

    it('should reconcile ledger', async () => {
      const job = makeJob(JOB_NAMES.RECONCILE_LEDGER, {
        ledgerId: 'ledger-1',
        period: '2024-Q1',
        idempotencyKey: 'idem-rec-ledger',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ reconciled: true });
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
