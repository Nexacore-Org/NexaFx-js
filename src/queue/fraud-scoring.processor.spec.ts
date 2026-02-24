import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { FraudScoringProcessor } from '../../src/queue/processors/fraud-scoring.processor';
import { QUEUE_NAMES, JOB_NAMES } from '../../src/queue/queue.constants';

const makeJob = (name: string, data: Record<string, unknown>, overrides: Partial<Job> = {}): Partial<Job> => ({
  id: 'fraud-job-1',
  name,
  data,
  attemptsMade: 0,
  opts: { attempts: 5 },
  ...overrides,
});

describe('FraudScoringProcessor', () => {
  let processor: FraudScoringProcessor;
  let dlqQueue: jest.Mocked<Partial<Queue>>;
  let fraudQueue: jest.Mocked<Partial<Queue>>;

  beforeEach(async () => {
    dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'dlq-1' }) };
    fraudQueue = { add: jest.fn().mockResolvedValue({ id: 'flag-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FraudScoringProcessor,
        { provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER), useValue: dlqQueue },
        { provide: getQueueToken(QUEUE_NAMES.FRAUD_SCORING), useValue: fraudQueue },
      ],
    }).compile();

    processor = module.get<FraudScoringProcessor>(FraudScoringProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    describe('score-transaction', () => {
      it('should return low risk for normal transaction', async () => {
        const job = makeJob(JOB_NAMES.SCORE_TRANSACTION, {
          transactionId: 'tx-1',
          userId: 'user-1',
          amount: 50,
          currency: 'USD',
          ipAddress: '1.2.3.4',
          deviceFingerprint: 'fp-abc',
          idempotencyKey: 'idem-score',
        });

        const result = await processor.process(job as Job);
        expect(result.success).toBe(true);
        const score = result.data as any;
        expect(score.riskLevel).toBe('low');
        expect(score.recommendation).toBe('allow');
        expect(fraudQueue.add).not.toHaveBeenCalled();
      });

      it('should flag high-amount transaction without device fingerprint', async () => {
        const job = makeJob(JOB_NAMES.SCORE_TRANSACTION, {
          transactionId: 'tx-high',
          userId: 'user-1',
          amount: 50000,
          currency: 'USD',
          idempotencyKey: 'idem-high',
        });

        const result = await processor.process(job as Job);
        const score = result.data as any;
        expect(score.signals).toContain('high_amount');
        expect(score.signals).toContain('missing_device');
        // Should trigger a flag-suspicious job
        expect(fraudQueue.add).toHaveBeenCalledWith(
          JOB_NAMES.FLAG_SUSPICIOUS,
          expect.objectContaining({ entityId: 'tx-high' }),
          expect.any(Object),
        );
      });
    });

    describe('review-account', () => {
      it('should review account and return action taken', async () => {
        const job = makeJob(JOB_NAMES.REVIEW_ACCOUNT, {
          accountId: 'acc-1',
          triggerReason: 'velocity',
          priority: 'high',
          idempotencyKey: 'idem-review',
        });

        const result = await processor.process(job as Job);
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ reviewed: true, accountId: 'acc-1' });
      });
    });

    describe('flag-suspicious', () => {
      it('should flag entity as suspicious', async () => {
        const job = makeJob(JOB_NAMES.FLAG_SUSPICIOUS, {
          entityType: 'transaction',
          entityId: 'tx-susp',
          reasons: ['high_amount'],
          score: 75,
          idempotencyKey: 'idem-flag',
        });

        const result = await processor.process(job as Job);
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ flagged: true, entityId: 'tx-susp' });
      });
    });

    it('should throw for unknown job', async () => {
      const job = makeJob('unknown', { idempotencyKey: 'idem-unk' });
      await expect(processor.process(job as Job)).rejects.toThrow('Unknown fraud job');
    });
  });

  describe('onFailed', () => {
    it('should send to DLQ on final attempt', async () => {
      const job = makeJob(
        JOB_NAMES.SCORE_TRANSACTION,
        { idempotencyKey: 'idem-fail' },
        { attemptsMade: 5, opts: { attempts: 5 } },
      );

      await processor.onFailed(job as Job, new Error('model error'));
      expect(dlqQueue.add).toHaveBeenCalledWith(
        'process-dlq',
        expect.objectContaining({ originalQueue: QUEUE_NAMES.FRAUD_SCORING }),
        expect.any(Object),
      );
    });
  });
});
