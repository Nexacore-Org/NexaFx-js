import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DeadLetterProcessor } from './dead-letter.processor';
import { DeadLetterJobEntity } from './entities/dead-letter-job.entity';
import { DlqAlertingService } from './services/alerting.service';
import { QUEUE_NAMES, JOB_NAMES } from './queue.constants';

const makeJob = (data: Record<string, unknown>): Partial<Job> => ({
  id: 'dlq-job-1',
  name: 'process-dlq',
  data,
  attemptsMade: 0,
  opts: { attempts: 1 },
});

describe('DeadLetterProcessor', () => {
  let processor: DeadLetterProcessor;
  let dlqRepo: { save: jest.Mock; create: jest.Mock };
  let alertingService: { sendDlqAlert: jest.Mock };

  beforeEach(async () => {
    dlqRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue({ id: 'saved-dlq-1' }),
    };
    alertingService = { sendDlqAlert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterProcessor,
        { provide: getRepositoryToken(DeadLetterJobEntity), useValue: dlqRepo },
        { provide: DlqAlertingService, useValue: alertingService },
      ],
    }).compile();

    processor = module.get<DeadLetterProcessor>(DeadLetterProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('should persist and alert on DLQ job', async () => {
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
      expect(dlqRepo.save).toHaveBeenCalledTimes(1);
      expect(alertingService.sendDlqAlert).toHaveBeenCalledTimes(1);
      expect(alertingService.sendDlqAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueue: QUEUE_NAMES.RETRY_JOBS,
          failureReason: 'payment gateway timeout',
        }),
      );
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

    it('should not throw if persistence fails', async () => {
      dlqRepo.save.mockRejectedValue(new Error('DB connection lost'));

      const job = makeJob({
        originalQueue: QUEUE_NAMES.RECONCILIATION,
        originalJobName: JOB_NAMES.RECONCILE_TRANSACTIONS,
        originalJobData: {},
        failureReason: 'timeout',
        failedAt: new Date().toISOString(),
        attemptsMade: 3,
        idempotencyKey: 'idem-persist-fail',
      });

      await expect(processor.process(job as Job)).resolves.toMatchObject({ success: true });
      expect(alertingService.sendDlqAlert).toHaveBeenCalledTimes(1);
    });

    it('should not throw if alerting fails', async () => {
      alertingService.sendDlqAlert.mockRejectedValue(new Error('notification service down'));

      const job = makeJob({
        originalQueue: QUEUE_NAMES.FRAUD_SCORING,
        originalJobName: JOB_NAMES.SCORE_TRANSACTION,
        originalJobData: {},
        failureReason: 'model error',
        failedAt: new Date().toISOString(),
        attemptsMade: 5,
        idempotencyKey: 'idem-alert-fail',
      });

      await expect(processor.process(job as Job)).resolves.toMatchObject({ success: true });
      expect(dlqRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
