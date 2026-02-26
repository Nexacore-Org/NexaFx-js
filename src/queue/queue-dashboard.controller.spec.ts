import { Test, TestingModule } from '@nestjs/testing';
import { QueueDashboardController } from '../../src/queue/queue-dashboard.controller';
import { QueueService } from '../../src/queue/queue.service';
import { QUEUE_NAMES } from '../../src/queue/queue.constants';

const mockQueueService = {
  getAllQueueStats: jest.fn(),
  getQueueStats: jest.fn(),
  getFailedJobs: jest.fn(),
  retryFailedJob: jest.fn(),
  pauseQueue: jest.fn(),
  resumeQueue: jest.fn(),
  cleanQueue: jest.fn(),
};

describe('QueueDashboardController', () => {
  let controller: QueueDashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueDashboardController],
      providers: [{ provide: QueueService, useValue: mockQueueService }],
    }).compile();

    controller = module.get<QueueDashboardController>(QueueDashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getAllStats', () => {
    it('should return stats for all queues', async () => {
      const stats = Object.values(QUEUE_NAMES).map((name) => ({
        queueName: name, waiting: 0, active: 0, completed: 10, failed: 0, delayed: 0, paused: 0,
      }));
      mockQueueService.getAllQueueStats.mockResolvedValue(stats);

      const result = await controller.getAllStats();
      expect(result).toHaveLength(stats.length);
    });
  });

  describe('getQueueStats', () => {
    it('should return stats for a named queue', async () => {
      const stat = { queueName: QUEUE_NAMES.RETRY_JOBS, waiting: 2, active: 1 };
      mockQueueService.getQueueStats.mockResolvedValue(stat);

      const result = await controller.getQueueStats(QUEUE_NAMES.RETRY_JOBS);
      expect(result).toEqual(stat);
      expect(mockQueueService.getQueueStats).toHaveBeenCalledWith(QUEUE_NAMES.RETRY_JOBS);
    });
  });

  describe('getFailedJobs', () => {
    it('should return serialized failed jobs', async () => {
      const failedJobs = [
        {
          id: 'j-1',
          name: 'retry-payment',
          data: { transactionId: 'tx-1' },
          failedReason: 'timeout',
          attemptsMade: 5,
          timestamp: Date.now(),
          processedOn: Date.now() - 1000,
          finishedOn: Date.now(),
        },
      ];
      mockQueueService.getFailedJobs.mockResolvedValue(failedJobs);

      const result = await controller.getFailedJobs(QUEUE_NAMES.RETRY_JOBS, 0, 9);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'j-1', failedReason: 'timeout' });
    });
  });

  describe('retryJob', () => {
    it('should call retryFailedJob and return confirmation', async () => {
      mockQueueService.retryFailedJob.mockResolvedValue(undefined);
      const result = await controller.retryJob(QUEUE_NAMES.RETRY_JOBS, 'job-123');
      expect(mockQueueService.retryFailedJob).toHaveBeenCalledWith(QUEUE_NAMES.RETRY_JOBS, 'job-123');
      expect(result.message).toContain('job-123');
    });
  });

  describe('pauseQueue', () => {
    it('should pause queue', async () => {
      mockQueueService.pauseQueue.mockResolvedValue(undefined);
      const result = await controller.pauseQueue(QUEUE_NAMES.FRAUD_SCORING);
      expect(result.message).toContain('paused');
    });
  });

  describe('resumeQueue', () => {
    it('should resume queue', async () => {
      mockQueueService.resumeQueue.mockResolvedValue(undefined);
      const result = await controller.resumeQueue(QUEUE_NAMES.WEBHOOK_DISPATCH);
      expect(result.message).toContain('resumed');
    });
  });

  describe('cleanQueue', () => {
    it('should clean completed jobs', async () => {
      mockQueueService.cleanQueue.mockResolvedValue(['j1', 'j2', 'j3']);
      const result = await controller.cleanQueue(
        QUEUE_NAMES.RETRY_JOBS, 0, 50, 'completed',
      );
      expect(result.message).toContain('3 jobs');
    });
  });
});
