import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueService } from '../../src/queue/queue.service';
import { QUEUE_NAMES, JOB_NAMES } from '../../src/queue/queue.constants';

const makeQueueMock = (): jest.Mocked<Partial<Queue>> => ({
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  getJob: jest.fn(),
  getFailed: jest.fn().mockResolvedValue([]),
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getCompletedCount: jest.fn().mockResolvedValue(0),
  getFailedCount: jest.fn().mockResolvedValue(0),
  getDelayedCount: jest.fn().mockResolvedValue(0),
  getPausedCount: jest.fn().mockResolvedValue(0),
  isPaused: jest.fn().mockResolvedValue(false),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  clean: jest.fn().mockResolvedValue([]),
  name: '',
});

describe('QueueService', () => {
  let service: QueueService;
  let retryQueue: jest.Mocked<Partial<Queue>>;
  let reconciliationQueue: jest.Mocked<Partial<Queue>>;
  let fraudQueue: jest.Mocked<Partial<Queue>>;
  let webhookQueue: jest.Mocked<Partial<Queue>>;
  let dlqQueue: jest.Mocked<Partial<Queue>>;

  beforeEach(async () => {
    retryQueue = makeQueueMock();
    (retryQueue as any).name = QUEUE_NAMES.RETRY_JOBS;

    reconciliationQueue = makeQueueMock();
    (reconciliationQueue as any).name = QUEUE_NAMES.RECONCILIATION;

    fraudQueue = makeQueueMock();
    (fraudQueue as any).name = QUEUE_NAMES.FRAUD_SCORING;

    webhookQueue = makeQueueMock();
    (webhookQueue as any).name = QUEUE_NAMES.WEBHOOK_DISPATCH;

    dlqQueue = makeQueueMock();
    (dlqQueue as any).name = QUEUE_NAMES.DEAD_LETTER;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: getQueueToken(QUEUE_NAMES.RETRY_JOBS), useValue: retryQueue },
        { provide: getQueueToken(QUEUE_NAMES.RECONCILIATION), useValue: reconciliationQueue },
        { provide: getQueueToken(QUEUE_NAMES.FRAUD_SCORING), useValue: fraudQueue },
        { provide: getQueueToken(QUEUE_NAMES.WEBHOOK_DISPATCH), useValue: webhookQueue },
        { provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER), useValue: dlqQueue },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── onModuleInit ───────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should resume paused queues on init', async () => {
      (retryQueue.isPaused as jest.Mock).mockResolvedValue(true);
      await service.onModuleInit();
      expect(retryQueue.resume).toHaveBeenCalled();
    });

    it('should not call resume if queue is running', async () => {
      await service.onModuleInit();
      expect(retryQueue.resume).not.toHaveBeenCalled();
    });
  });

  // ── Retry Jobs ─────────────────────────────────────────────────────────────

  describe('enqueueRetryPayment', () => {
    const data = {
      transactionId: 'tx-1',
      userId: 'user-1',
      amount: 100,
      currency: 'USD',
      paymentMethod: 'card',
      attemptNumber: 1,
    };

    it('should add a retry-payment job with idempotency key', async () => {
      await service.enqueueRetryPayment(data, 'idem-123');
      expect(retryQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.RETRY_PAYMENT,
        expect.objectContaining({ ...data, idempotencyKey: 'idem-123' }),
        expect.objectContaining({ jobId: 'retry-payment-idem-123' }),
      );
    });

    it('should generate idempotency key when not provided', async () => {
      await service.enqueueRetryPayment(data);
      expect(retryQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.RETRY_PAYMENT,
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
        expect.any(Object),
      );
    });
  });

  describe('enqueueRetryTransfer', () => {
    it('should enqueue a retry-transfer job', async () => {
      await service.enqueueRetryTransfer(
        {
          transferId: 'tr-1',
          fromAccountId: 'acc-a',
          toAccountId: 'acc-b',
          amount: 50,
          currency: 'EUR',
          attemptNumber: 1,
        },
        'idem-transfer',
      );
      expect(retryQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.RETRY_TRANSFER,
        expect.objectContaining({ transferId: 'tr-1', idempotencyKey: 'idem-transfer' }),
        expect.objectContaining({ jobId: 'retry-transfer-idem-transfer' }),
      );
    });
  });

  describe('enqueueRetryNotification', () => {
    it('should enqueue a retry-notification job', async () => {
      await service.enqueueRetryNotification(
        {
          notificationId: 'notif-1',
          userId: 'user-1',
          channel: 'email',
          payload: { subject: 'test' },
        },
        'idem-notif',
      );
      expect(retryQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.RETRY_NOTIFICATION,
        expect.objectContaining({ notificationId: 'notif-1' }),
        expect.any(Object),
      );
    });
  });

  // ── Reconciliation Jobs ────────────────────────────────────────────────────

  describe('enqueueReconcileTransactions', () => {
    it('should enqueue reconcile-transactions job', async () => {
      await service.enqueueReconcileTransactions(
        { startDate: '2024-01-01', endDate: '2024-01-31' },
        'idem-reconcile',
      );
      expect(reconciliationQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.RECONCILE_TRANSACTIONS,
        expect.objectContaining({ startDate: '2024-01-01', idempotencyKey: 'idem-reconcile' }),
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  describe('enqueueReconcileBalances', () => {
    it('should enqueue reconcile-balances job', async () => {
      await service.enqueueReconcileBalances(
        { accountIds: ['acc-1', 'acc-2'], asOfDate: '2024-01-31' },
        'idem-bal',
      );
      expect(reconciliationQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.RECONCILE_BALANCES,
        expect.objectContaining({ accountIds: ['acc-1', 'acc-2'] }),
        expect.any(Object),
      );
    });
  });

  // ── Fraud Jobs ─────────────────────────────────────────────────────────────

  describe('enqueueScoreTransaction', () => {
    it('should enqueue score-transaction job with priority 1', async () => {
      await service.enqueueScoreTransaction(
        { transactionId: 'tx-fraud', userId: 'user-1', amount: 500, currency: 'USD' },
        'idem-fraud',
      );
      expect(fraudQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.SCORE_TRANSACTION,
        expect.objectContaining({ transactionId: 'tx-fraud' }),
        expect.objectContaining({ priority: 1 }),
      );
    });
  });

  describe('enqueueReviewAccount', () => {
    it('should set priority 1 for critical reviews', async () => {
      await service.enqueueReviewAccount(
        { accountId: 'acc-1', triggerReason: 'suspicious', priority: 'critical' },
        'idem-review',
      );
      expect(fraudQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.REVIEW_ACCOUNT,
        expect.any(Object),
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('should set priority 3 for low reviews', async () => {
      await service.enqueueReviewAccount(
        { accountId: 'acc-1', triggerReason: 'routine', priority: 'low' },
        'idem-review-low',
      );
      expect(fraudQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.REVIEW_ACCOUNT,
        expect.any(Object),
        expect.objectContaining({ priority: 3 }),
      );
    });
  });

  // ── Webhook Jobs ───────────────────────────────────────────────────────────

  describe('enqueueDispatchWebhook', () => {
    it('should enqueue webhook with 8 attempts and exponential backoff', async () => {
      await service.enqueueDispatchWebhook(
        {
          webhookId: 'wh-1',
          endpoint: 'https://example.com/hooks',
          event: 'payment.succeeded',
          payload: { amount: 100 },
          attemptNumber: 1,
        },
        'idem-wh',
      );
      expect(webhookQueue.add).toHaveBeenCalledWith(
        JOB_NAMES.DISPATCH_WEBHOOK,
        expect.objectContaining({ webhookId: 'wh-1' }),
        expect.objectContaining({
          attempts: 8,
          backoff: expect.objectContaining({ type: 'exponential' }),
        }),
      );
    });
  });

  // ── Queue Management ───────────────────────────────────────────────────────

  describe('getQueueStats', () => {
    it('should return full stats for a valid queue', async () => {
      const stats = await service.getQueueStats(QUEUE_NAMES.RETRY_JOBS);
      expect(stats).toMatchObject({
        queueName: QUEUE_NAMES.RETRY_JOBS,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      });
    });

    it('should return null for unknown queue', async () => {
      const stats = await service.getQueueStats('unknown-queue');
      expect(stats).toBeNull();
    });
  });

  describe('getAllQueueStats', () => {
    it('should return stats for all queues', async () => {
      const allStats = await service.getAllQueueStats();
      expect(allStats).toHaveLength(Object.values(QUEUE_NAMES).length);
    });
  });

  describe('getFailedJobs', () => {
    it('should return empty array for unknown queue', async () => {
      const jobs = await service.getFailedJobs('unknown-queue');
      expect(jobs).toEqual([]);
    });

    it('should call getFailed on the queue', async () => {
      (retryQueue.getFailed as jest.Mock).mockResolvedValue([{ id: 'job-1' }]);
      const jobs = await service.getFailedJobs(QUEUE_NAMES.RETRY_JOBS, 0, 9);
      expect(retryQueue.getFailed).toHaveBeenCalledWith(0, 9);
      expect(jobs).toHaveLength(1);
    });
  });

  describe('retryFailedJob', () => {
    it('should retry a failed job', async () => {
      const mockJob = { retry: jest.fn().mockResolvedValue(undefined) };
      (retryQueue.getJob as jest.Mock).mockResolvedValue(mockJob);

      await service.retryFailedJob(QUEUE_NAMES.RETRY_JOBS, 'job-123');
      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('should throw if queue does not exist', async () => {
      await expect(service.retryFailedJob('bad-queue', 'job-1')).rejects.toThrow(
        'Queue bad-queue not found',
      );
    });

    it('should throw if job does not exist', async () => {
      (retryQueue.getJob as jest.Mock).mockResolvedValue(null);
      await expect(
        service.retryFailedJob(QUEUE_NAMES.RETRY_JOBS, 'missing-job'),
      ).rejects.toThrow('Job missing-job not found');
    });
  });

  describe('pauseQueue / resumeQueue', () => {
    it('should pause a queue', async () => {
      await service.pauseQueue(QUEUE_NAMES.RETRY_JOBS);
      expect(retryQueue.pause).toHaveBeenCalled();
    });

    it('should resume a queue', async () => {
      await service.resumeQueue(QUEUE_NAMES.RETRY_JOBS);
      expect(retryQueue.resume).toHaveBeenCalled();
    });

    it('should throw for unknown queue on pause', async () => {
      await expect(service.pauseQueue('bad-queue')).rejects.toThrow(
        'Queue bad-queue not found',
      );
    });
  });

  describe('cleanQueue', () => {
    it('should clean completed jobs', async () => {
      (retryQueue.clean as jest.Mock).mockResolvedValue(['j1', 'j2']);
      const result = await service.cleanQueue(QUEUE_NAMES.RETRY_JOBS, 0, 50, 'completed');
      expect(retryQueue.clean).toHaveBeenCalledWith(0, 50, 'completed');
      expect(result).toHaveLength(2);
    });
  });
});
