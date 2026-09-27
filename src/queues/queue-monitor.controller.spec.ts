import { Test, TestingModule } from '@nestjs/testing';
import { QueueMonitorController } from './queue-monitor.controller';
import { QUEUE_NAMES } from './queue.constants';
import { NotFoundException } from '@nestjs/common';
import { Queue } from 'bull';

describe('QueueMonitorController', () => {
  let controller: QueueMonitorController;
  let mockQueue: Queue;

  beforeEach(async () => {
    mockQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(1),
      getActiveCount: jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(3),
      getFailedCount: jest.fn().mockResolvedValue(4),
      getDelayedCount: jest.fn().mockResolvedValue(5),
      getFailed: jest
        .fn()
        .mockResolvedValue([
          { id: '1', name: 'test-job', failedReason: 'error', timestamp: 123 },
        ]),
    } as unknown as Queue;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueMonitorController],
      providers: [
        { provide: `BullQueue_${QUEUE_NAMES.EMAIL}`, useValue: mockQueue },
        {
          provide: `BullQueue_${QUEUE_NAMES.NOTIFICATION}`,
          useValue: mockQueue,
        },
        {
          provide: `BullQueue_${QUEUE_NAMES.TRANSACTION}`,
          useValue: mockQueue,
        },
      ],
    }).compile();

    controller = module.get<QueueMonitorController>(QueueMonitorController);
  });

  it('aggregates counts correctly in getAll()', async () => {
    const stats = await controller.getAll();
    expect(stats[QUEUE_NAMES.EMAIL]).toEqual({
      waiting: 1,
      active: 2,
      completed: 3,
      failed: 4,
      delayed: 5,
    });
  });

  it('retrieves failed jobs correctly', async () => {
    const failedJobs = await controller.getFailed(QUEUE_NAMES.EMAIL);
    expect(failedJobs).toEqual([
      { id: '1', name: 'test-job', failedReason: 'error', timestamp: 123 },
    ]);
  });

  it('throws NotFoundException for unknown queue', async () => {
    await expect(controller.getFailed('unknown-queue')).rejects.toThrow(
      NotFoundException,
    );
  });
});
