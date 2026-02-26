import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { WebhookDispatchProcessor } from '../../src/queue/processors/webhook-dispatch.processor';
import { QUEUE_NAMES, JOB_NAMES } from '../../src/queue/queue.constants';

global.fetch = jest.fn();

const makeJob = (data: Record<string, unknown>, overrides: Partial<Job> = {}): Partial<Job> => ({
  id: 'wh-job-1',
  name: JOB_NAMES.DISPATCH_WEBHOOK,
  data,
  attemptsMade: 0,
  opts: { attempts: 8 },
  ...overrides,
});

describe('WebhookDispatchProcessor', () => {
  let processor: WebhookDispatchProcessor;
  let dlqQueue: jest.Mocked<Partial<Queue>>;

  beforeEach(async () => {
    dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'dlq-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDispatchProcessor,
        { provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER), useValue: dlqQueue },
      ],
    }).compile();

    processor = module.get<WebhookDispatchProcessor>(WebhookDispatchProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('should dispatch webhook and return 200 result', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"received":true}'),
      });

      const job = makeJob({
        webhookId: 'wh-1',
        endpoint: 'https://example.com/hooks',
        event: 'payment.succeeded',
        payload: { amount: 100 },
        attemptNumber: 1,
        idempotencyKey: 'idem-wh',
      });

      const result = await processor.process(job as Job);
      expect(result.success).toBe(true);
      const delivery = result.data as any;
      expect(delivery.statusCode).toBe(200);
      expect(delivery.success).toBe(true);
    });

    it('should include HMAC signature when signingSecret is provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('ok'),
      });

      const job = makeJob({
        webhookId: 'wh-signed',
        endpoint: 'https://example.com/hooks',
        event: 'transfer.completed',
        payload: { amount: 50 },
        signingSecret: 'super-secret',
        attemptNumber: 1,
        idempotencyKey: 'idem-signed',
      });

      await processor.process(job as Job);

      const [, , fetchOptions] = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should throw when endpoint returns non-2xx status', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      });

      const job = makeJob({
        webhookId: 'wh-fail',
        endpoint: 'https://example.com/hooks',
        event: 'payment.failed',
        payload: {},
        attemptNumber: 1,
        idempotencyKey: 'idem-fail',
      });

      await expect(processor.process(job as Job)).rejects.toThrow('status 500');
    });

    it('should throw for unknown job name', async () => {
      const job = { ...makeJob({ idempotencyKey: 'idem-unk' }), name: 'unknown' };
      await expect(processor.process(job as Job)).rejects.toThrow('Unknown webhook job');
    });
  });

  describe('onFailed', () => {
    it('should route to DLQ after exhausting all 8 attempts', async () => {
      const job = makeJob(
        { webhookId: 'wh-dlq', idempotencyKey: 'idem-dlq' },
        { attemptsMade: 8, opts: { attempts: 8 } },
      );

      await processor.onFailed(job as Job, new Error('endpoint unreachable'));
      expect(dlqQueue.add).toHaveBeenCalledWith(
        'process-dlq',
        expect.objectContaining({
          originalQueue: QUEUE_NAMES.WEBHOOK_DISPATCH,
          failureReason: 'endpoint unreachable',
        }),
        expect.any(Object),
      );
    });

    it('should not route to DLQ if attempts remain', async () => {
      const job = makeJob(
        { idempotencyKey: 'idem-partial' },
        { attemptsMade: 3, opts: { attempts: 8 } },
      );

      await processor.onFailed(job as Job, new Error('timeout'));
      expect(dlqQueue.add).not.toHaveBeenCalled();
    });
  });
});
