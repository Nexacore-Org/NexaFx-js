import { Test, TestingModule } from '@nestjs/testing';
import { NotificationThrottleService } from './notification-throttle.service';
import { NotificationService } from './notification.service';
import { NotificationThrottleEntity } from '../entities/notification-throttle.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('NotificationThrottling', () => {
  let module: TestingModule;
  let throttleService: NotificationThrottleService;
  let notificationService: NotificationService;
  let throttleRepo: Repository<NotificationThrottleEntity>;

  beforeEach(async () => {
    const mockThrottleRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((dto) => dto),
      update: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        NotificationThrottleService,
        NotificationService,
        {
          provide: getRepositoryToken(NotificationThrottleEntity),
          useValue: mockThrottleRepo,
        },
      ],
    }).compile();

    throttleService = module.get<NotificationThrottleService>(NotificationThrottleService);
    notificationService = module.get<NotificationService>(NotificationService);
    throttleRepo = module.get<Repository<NotificationThrottleEntity>>(
      getRepositoryToken(NotificationThrottleEntity),
    );
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Notification Queuing', () => {
    it('should queue a notification when throttling is enabled', async () => {
      const mockThrottle = {
        notificationType: 'test.event',
        maxBatchSize: 10,
        windowSeconds: 300,
        enabled: true,
        pendingCount: 0,
      };

      jest.spyOn(throttleRepo, 'findOne').mockResolvedValue(mockThrottle as any);
      jest.spyOn(throttleRepo, 'save').mockResolvedValue(mockThrottle as any);

      const result = await notificationService.send({
        type: 'test.event',
        payload: { test: true },
      });

      expect(result.queued).toBe(true);
    });

    it('should not queue a notification when throttling is disabled', async () => {
      const mockThrottle = {
        notificationType: 'test.event',
        enabled: false,
      };

      jest.spyOn(throttleRepo, 'findOne').mockResolvedValue(mockThrottle as any);

      const result = await notificationService.send({
        type: 'test.event',
        payload: { test: true },
      });

      expect(result.queued).toBe(false);
    });
  });

  describe('Batch Flushing', () => {
    it('should flush batches when size threshold is reached', async () => {
      const mockThrottle = {
        notificationType: 'test.event',
        maxBatchSize: 2,
        windowSeconds: 300,
        enabled: true,
        pendingCount: 0,
      };

      jest.spyOn(throttleRepo, 'findOne').mockResolvedValue(mockThrottle as any);
      jest.spyOn(throttleRepo, 'save').mockResolvedValue(mockThrottle as any);

      // Queue first notification
      await notificationService.send({
        type: 'test.event',
        payload: { id: 1 },
      });

      // Queue second notification (should trigger flush)
      const result = await notificationService.send({
        type: 'test.event',
        payload: { id: 2 },
      });

      expect(result.queued).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    it('should update throttle configuration', async () => {
      const mockThrottle = {
        id: 'test-id',
        notificationType: 'test.event',
        maxBatchSize: 10,
        windowSeconds: 300,
        cooldownSeconds: 60,
        enabled: true,
      };

      jest.spyOn(throttleRepo, 'findOne').mockResolvedValue(mockThrottle as any);
      jest.spyOn(throttleRepo, 'save').mockResolvedValue(mockThrottle as any);

      const updated = await notificationService.updateThrottleConfig('test.event', {
        maxBatchSize: 20,
      });

      expect(throttleRepo.save).toHaveBeenCalled();
    });

    it('should retrieve all throttle configurations', async () => {
      const configs = [
        { notificationType: 'test.event1', enabled: true },
        { notificationType: 'test.event2', enabled: true },
      ];

      jest.spyOn(throttleRepo, 'find').mockResolvedValue(configs as any);

      const result = await notificationService.getAllThrottleConfigs();

      expect(result).toHaveLength(2);
      expect(throttleRepo.find).toHaveBeenCalled();
    });
  });

  describe('Queue Status Monitoring', () => {
    it('should return queue status for all types', async () => {
      const configs = [
        {
          notificationType: 'test.event1',
          maxBatchSize: 10,
          windowSeconds: 300,
          enabled: true,
        },
        {
          notificationType: 'test.event2',
          maxBatchSize: 20,
          windowSeconds: 600,
          enabled: true,
        },
      ];

      jest.spyOn(throttleRepo, 'find').mockResolvedValue(configs as any);

      const status = await notificationService.getQueueStatus();

      expect(status).toHaveLength(2);
      expect(status[0]).toHaveProperty('notificationType');
      expect(status[0]).toHaveProperty('queueLength');
      expect(status[0]).toHaveProperty('maxBatchSize');
    });
  });

  describe('Throttle Reset', () => {
    it('should reset throttle state for a notification type', async () => {
      const mockThrottle = {
        notificationType: 'test.event',
        currentBatchCount: 5,
        pendingCount: 10,
        batchStartedAt: new Date(),
      };

      jest.spyOn(throttleRepo, 'findOne').mockResolvedValue(mockThrottle as any);
      jest.spyOn(throttleRepo, 'save').mockResolvedValue(mockThrottle as any);

      await notificationService.reset('test.event');

      expect(throttleRepo.findOne).toHaveBeenCalledWith({
        where: { notificationType: 'test.event' },
      });
    });
  });
});
