import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { NotificationsPersistenceService } from '../notifications-persistence.service';
import { NOTIFICATION_EVENTS } from '../notifications.constants';
import { Server } from 'socket.io';

const mockPersistence = () => ({
  persist: jest.fn(),
  markDelivered: jest.fn(),
  getMissedEvents: jest.fn(),
  incrementAttempts: jest.fn(),
  pruneExpired: jest.fn(),
});

const makePersistedNotification = (overrides = {}) => ({
  id: 'notif-uuid-123',
  userId: 'user-1',
  event: NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED,
  payload: {},
  delivered: false,
  deliveryAttempts: 0,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  deliveredAt: null,
  expiresAt: new Date('2024-01-02T00:00:00Z'),
  ...overrides,
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let persistence: ReturnType<typeof mockPersistence>;
  let mockServer: Partial<Server>;

  beforeEach(async () => {
    persistence = mockPersistence();
    persistence.persist.mockResolvedValue(makePersistedNotification());
    persistence.markDelivered.mockResolvedValue(undefined);
    persistence.getMissedEvents.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsPersistenceService, useValue: persistence },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    // Mock Socket.IO server
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn().mockReturnThis(),
    } as any;
    service.setServer(mockServer as Server);
  });

  describe('setServer', () => {
    it('should assign server instance', () => {
      const anotherServer = {} as Server;
      service.setServer(anotherServer);
      // No error thrown
    });
  });

  describe('emitToUser', () => {
    it('should persist and emit event to user channel', async () => {
      await service.emitToUser('user-1', NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED, {
        transactionId: 'tx-1',
      });

      expect(persistence.persist).toHaveBeenCalledWith({
        event: NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED,
        payload: { transactionId: 'tx-1' },
        userId: 'user-1',
      });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(persistence.markDelivered).toHaveBeenCalledWith(['notif-uuid-123']);
    });

    it('should persist event even when server is not set (offline user)', async () => {
      service.setServer(null as any);
      await service.emitToUser('user-offline', NOTIFICATION_EVENTS.FRAUD_ALERT, {});
      expect(persistence.persist).toHaveBeenCalled();
      expect(persistence.markDelivered).not.toHaveBeenCalled();
    });
  });

  describe('emitToAdmins', () => {
    it('should persist and emit to admin channel', async () => {
      await service.emitToAdmins(NOTIFICATION_EVENTS.ADMIN_ALERT, { message: 'test' });

      expect(persistence.persist).toHaveBeenCalledWith({
        event: NOTIFICATION_EVENTS.ADMIN_ALERT,
        payload: { message: 'test' },
      });
      expect(mockServer.to).toHaveBeenCalledWith('admin:global');
    });
  });

  describe('emitTransactionUpdate', () => {
    it.each([
      ['created', NOTIFICATION_EVENTS.TRANSACTION_CREATED],
      ['pending', NOTIFICATION_EVENTS.TRANSACTION_PENDING],
      ['confirmed', NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED],
      ['failed', NOTIFICATION_EVENTS.TRANSACTION_FAILED],
      ['reversed', NOTIFICATION_EVENTS.TRANSACTION_REVERSED],
    ])('should emit correct event for status "%s"', async (status, expectedEvent) => {
      await service.emitTransactionUpdate('user-1', 'tx-1', status);
      expect(persistence.persist).toHaveBeenCalledWith(
        expect.objectContaining({ event: expectedEvent }),
      );
    });

    it('should also emit on transaction-specific room', async () => {
      await service.emitTransactionUpdate('user-1', 'tx-abc', 'confirmed');
      expect(mockServer.to).toHaveBeenCalledWith('transaction:tx-abc');
    });

    it('should default to pending for unknown status', async () => {
      await service.emitTransactionUpdate('user-1', 'tx-1', 'unknown-status');
      expect(persistence.persist).toHaveBeenCalledWith(
        expect.objectContaining({ event: NOTIFICATION_EVENTS.TRANSACTION_PENDING }),
      );
    });
  });

  describe('emitApprovalUpdate', () => {
    it.each([
      ['granted', NOTIFICATION_EVENTS.APPROVAL_GRANTED],
      ['rejected', NOTIFICATION_EVENTS.APPROVAL_REJECTED],
      ['expired', NOTIFICATION_EVENTS.APPROVAL_EXPIRED],
      ['threshold_met', NOTIFICATION_EVENTS.APPROVAL_THRESHOLD_MET],
    ])('should emit correct approval event for status "%s"', async (status, expectedEvent) => {
      await service.emitApprovalUpdate('user-1', 'appr-1', status);
      expect(persistence.persist).toHaveBeenCalledWith(
        expect.objectContaining({ event: expectedEvent }),
      );
    });

    it('should notify admins of approval updates', async () => {
      await service.emitApprovalUpdate('user-1', 'appr-1', 'granted');
      const persistCalls = persistence.persist.mock.calls;
      // One for user, one for admins
      expect(persistCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('emitFraudAlert', () => {
    it('should notify user and admin channels', async () => {
      await service.emitFraudAlert('user-1', 'alert-1', 'high', { reason: 'test' });

      const toMock = mockServer.to as jest.Mock;
      const channels = toMock.mock.calls.map((c) => c[0]);
      expect(channels).toContain('user:user-1');
      expect(channels).toContain('fraud:alerts');
    });
  });

  describe('deliverMissedEvents', () => {
    it('should not emit if no missed events', async () => {
      persistence.getMissedEvents.mockResolvedValue([]);
      await service.deliverMissedEvents('user-1', new Date());
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should emit missed events batch and mark delivered', async () => {
      const missed = [
        makePersistedNotification({ id: 'n1' }),
        makePersistedNotification({ id: 'n2' }),
      ];
      persistence.getMissedEvents.mockResolvedValue(missed);

      await service.deliverMissedEvents('user-1', new Date('2023-12-31'));

      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(persistence.markDelivered).toHaveBeenCalledWith(['n1', 'n2']);
    });
  });
});
