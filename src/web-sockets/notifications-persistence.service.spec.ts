import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsPersistenceService } from '../notifications-persistence.service';
import { PersistedNotification } from '../entities/persisted-notification.entity';
import { NOTIFICATION_EVENTS } from '../notifications.constants';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
  increment: jest.fn(),
});

type MockRepo = ReturnType<typeof mockRepo>;

describe('NotificationsPersistenceService', () => {
  let service: NotificationsPersistenceService;
  let repo: MockRepo;

  const makeEntity = (overrides: Partial<PersistedNotification> = {}): PersistedNotification => ({
    id: 'notif-1',
    userId: 'user-1',
    event: NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED,
    payload: { transactionId: 'tx-1' },
    delivered: false,
    deliveryAttempts: 0,
    createdAt: new Date('2024-01-01T12:00:00Z'),
    deliveredAt: null,
    expiresAt: new Date('2024-01-02T12:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    repo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsPersistenceService,
        {
          provide: getRepositoryToken(PersistedNotification),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get<NotificationsPersistenceService>(NotificationsPersistenceService);
  });

  describe('persist', () => {
    it('should create and save a notification with expiry', async () => {
      const entity = makeEntity();
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.persist({
        event: NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED,
        payload: { transactionId: 'tx-1' },
        userId: 'user-1',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          event: NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED,
          delivered: false,
          expiresAt: expect.any(Date),
        }),
      );
      expect(repo.save).toHaveBeenCalledWith(entity);
      expect(result).toBe(entity);
    });

    it('should persist broadcast notification with null userId', async () => {
      const entity = makeEntity({ userId: null });
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.persist({
        event: NOTIFICATION_EVENTS.ADMIN_ALERT,
        payload: {},
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
      );
    });
  });

  describe('markDelivered', () => {
    it('should update delivered status and timestamp', async () => {
      repo.update.mockResolvedValue({ affected: 2 });
      await service.markDelivered(['id-1', 'id-2']);
      expect(repo.update).toHaveBeenCalledWith(
        ['id-1', 'id-2'],
        expect.objectContaining({ delivered: true, deliveredAt: expect.any(Date) }),
      );
    });

    it('should not call update when ids array is empty', async () => {
      await service.markDelivered([]);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('getMissedEvents', () => {
    it('should query for user and broadcast undelivered events since date', async () => {
      const events = [makeEntity(), makeEntity({ id: 'notif-2', userId: null })];
      repo.find.mockResolvedValue(events);

      const since = new Date('2024-01-01T00:00:00Z');
      const result = await service.getMissedEvents('user-1', since, 50);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'ASC' },
          take: 50,
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('should cap limit at MAX_MISSED_EVENTS_PER_USER (200)', async () => {
      repo.find.mockResolvedValue([]);
      await service.getMissedEvents('user-1', new Date(), 9999);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });

  describe('incrementAttempts', () => {
    it('should increment deliveryAttempts for given id', async () => {
      repo.increment.mockResolvedValue({ affected: 1 });
      await service.incrementAttempts('notif-1');
      expect(repo.increment).toHaveBeenCalledWith({ id: 'notif-1' }, 'deliveryAttempts', 1);
    });
  });

  describe('pruneExpired', () => {
    it('should delete expired notifications and return count', async () => {
      repo.delete.mockResolvedValue({ affected: 7 });
      const count = await service.pruneExpired();
      expect(count).toBe(7);
      expect(repo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: expect.any(Object) }),
      );
    });

    it('should return 0 when nothing deleted', async () => {
      repo.delete.mockResolvedValue({ affected: null });
      const count = await service.pruneExpired();
      expect(count).toBe(0);
    });
  });
});
