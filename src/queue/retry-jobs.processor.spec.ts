import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { RetryJobsProcessor } from '../../src/queue/processors/retry-jobs.processor';
import { QUEUE_NAMES, JOB_NAMES } from '../../src/queue/queue.constants';

const makeJobMock = (
  name: string,
  data: Record<string, unknown>,
  overrides: Partial<Job> = {},
): Partial<Job> => ({
  id: 'job-test-1',
  name,
  data,
  attemptsMade: 0,
  opts: { attempts: 5 },
  ...overrides,
});

describe('RetryJobsProcessor', () => {
  let processor: RetryJobsProcessor;
  let dlqQueue: jest.Mocked<Partial<Queue>>;

  beforeEach(async () => {
    dlqQueue = {
      add: jest.fn().mockResolvedValue({ id: 'dlq-job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryJobsProcessor,
        { provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER), useValue: dlqQueue },
      ],
    }).compile();

    processor = module.get<RetryJobsProcessor>(RetryJobsProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  // ── process ───────────────────────────────────────────────────────────────

  describe('process', () => {
    it('should process retry-payment job successfully', async () => {
      const job = makeJobMock(JOB_NAMES.RETRY_PAYMENT, {
        transactionId: 'tx-1',
        userId: 'user-1',
        amount: 100,
        currency: 'USD',
        paymentMethod: 'card',
        attemptNumber: 1,
        idempotencyKey: 'idem-pay',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      expect(result.idempotencyKey).toBe('idem-pay');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should process retry-transfer job successfully', async () => {
      const job = makeJobMock(JOB_NAMES.RETRY_TRANSFER, {
        transferId: 'tr-1',
        fromAccountId: 'acc-a',
        toAccountId: 'acc-b',
        amount: 50,
        currency: 'EUR',
        attemptNumber: 1,
        idempotencyKey: 'idem-transfer',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
    });

    it('should process retry-notification job successfully', async () => {
      const job = makeJobMock(JOB_NAMES.RETRY_NOTIFICATION, {
        notificationId: 'notif-1',
        userId: 'user-1',
        channel: 'email',
        payload: { subject: 'test' },
        idempotencyKey: 'idem-notif',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
    });

    it('should throw for unknown job name', async () => {
      const job = makeJobMock('unknown-job', { idempotencyKey: 'idem-unknown' });
      await expect(processor.process(job as Job)).rejects.toThrow(
        'Unknown job name: unknown-job',
      );
    });
  });

  // ── onFailed ──────────────────────────────────────────────────────────────

  describe('onFailed', () => {
    it('should send job to DLQ on final attempt', async () => {
      const job = makeJobMock(
        JOB_NAMES.RETRY_PAYMENT,
        { idempotencyKey: 'idem-failed' },
        { attemptsMade: 5, opts: { attempts: 5 } },
      );

      await processor.onFailed(job as Job, new Error('payment failed'));
      expect(dlqQueue.add).toHaveBeenCalledWith(
        'process-dlq',
        expect.objectContaining({
          originalQueue: QUEUE_NAMES.RETRY_JOBS,
          originalJobName: JOB_NAMES.RETRY_PAYMENT,
          failureReason: 'payment failed',
        }),
        expect.any(Object),
      );
    });

    it('should NOT send to DLQ if attempts remain', async () => {
      const job = makeJobMock(
        JOB_NAMES.RETRY_PAYMENT,
        { idempotencyKey: 'idem-3' },
        { attemptsMade: 2, opts: { attempts: 5 } },
      );

      await processor.onFailed(job as Job, new Error('temporary'));
      expect(dlqQueue.add).not.toHaveBeenCalled();
    });
  });
});
