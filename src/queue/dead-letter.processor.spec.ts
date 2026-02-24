import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DeadLetterProcessor } from '../../src/queue/processors/dead-letter.processor';
import { QUEUE_NAMES, JOB_NAMES } from '../../src/queue/queue.constants';

const makeJob = (data: Record<string, unknown>): Partial<Job> => ({
  id: 'dlq-job-1',
  name: 'process-dlq',
  data,
  attemptsMade: 0,
  opts: { attempts: 1 },
});

describe('DeadLetterProcessor', () => {
  let processor: DeadLetterProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeadLetterProcessor],
    }).compile();

    processor = module.get<DeadLetterProcessor>(DeadLetterProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('should log and acknowledge DLQ job', async () => {
      const job = makeJob({
        originalQueue: QUEUE_NAMES.RETRY_JOBS,
        originalJobName: JOB_NAMES.RETRY_PAYMENT,
        originalJobData: { transactionId: 'tx-fail' },
        failureReason: 'payment gateway timeout',
        failedAt: new Date().toISOString(),
        attemptsMade: 5,
        idempotencyKey: 'idem-dlq',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        logged: true,
        originalQueue: QUEUE_NAMES.RETRY_JOBS,
        originalJobName: JOB_NAMES.RETRY_PAYMENT,
      });
    });

    it('should include idempotencyKey in result', async () => {
      const job = makeJob({
        originalQueue: QUEUE_NAMES.WEBHOOK_DISPATCH,
        originalJobName: JOB_NAMES.DISPATCH_WEBHOOK,
        originalJobData: {},
        failureReason: '404 not found',
        failedAt: new Date().toISOString(),
        attemptsMade: 8,
        idempotencyKey: 'idem-wh-dlq',
      });

      const result = await processor.process(job as Job);
      expect(result.idempotencyKey).toBe('idem-wh-dlq');
    });
  });
});
