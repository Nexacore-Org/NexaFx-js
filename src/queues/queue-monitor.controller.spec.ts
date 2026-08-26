import { Test, TestingModule } from '@nestjs/testing';
import { QueueMonitorController } from './queue-monitor.controller';
import { getQueueToken } from '@nestjs/bull';
import { QUEUE_NAMES } from './queue.constants';

describe('QueueMonitorController', () => {
  let controller: QueueMonitorController;

  const mockQueue = {
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(10),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    getFailed: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueMonitorController],
      providers: [
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockQueue },
        { provide: getQueueToken(QUEUE_NAMES.TRANSACTION), useValue: mockQueue },
      ],
    }).compile();

    controller = module.get<QueueMonitorController>(QueueMonitorController);
  });

  it('should return queue statistics for all queues', async () => {
    const stats = await controller.getAll();
    expect(stats[QUEUE_NAMES.EMAIL]).toBeDefined();
    expect(stats[QUEUE_NAMES.NOTIFICATION]).toBeDefined();
    expect(stats[QUEUE_NAMES.TRANSACTION]).toBeDefined();
  });
});
