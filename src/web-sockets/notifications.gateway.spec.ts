import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { NotificationsGateway } from '../notifications.gateway';
import { NotificationsService } from '../notifications.service';
import { NotificationsPersistenceService } from '../notifications-persistence.service';
import { NOTIFICATION_EVENTS } from '../notifications.constants';

const makeSocket = (overrides: Record<string, any> = {}) => ({
  id: 'socket-123',
  handshake: {
    headers: {},
    auth: { token: 'Bearer valid.jwt.token' },
    query: {},
  },
  join: jest.fn().mockResolvedValue(undefined),
  leave: jest.fn().mockResolvedValue(undefined),
  emit: jest.fn(),
  disconnect: jest.fn(),
  rooms: new Set(['socket-123', 'user:user-1']),
  user: { sub: 'user-1', email: 'user@test.com', roles: ['user'] },
  ...overrides,
});

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let jwtService: jest.Mocked<JwtService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let persistence: jest.Mocked<NotificationsPersistenceService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        {
          provide: NotificationsService,
          useValue: {
            setServer: jest.fn(),
            deliverMissedEvents: jest.fn(),
          },
        },
        {
          provide: NotificationsPersistenceService,
          useValue: { pruneExpired: jest.fn() },
        },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    jwtService = module.get(JwtService);
    notificationsService = module.get(NotificationsService);
    persistence = module.get(NotificationsPersistenceService);

    // Mock server
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  describe('afterInit', () => {
    it('should call setServer with the server instance', () => {
      const mockServer = {} as any;
      gateway.afterInit(mockServer);
      expect(notificationsService.setServer).toHaveBeenCalledWith(mockServer);
    });
  });

  describe('handleConnection', () => {
    it('should authenticate, join rooms, and emit ACK for valid user', async () => {
      const payload = { sub: 'user-1', email: 'u@test.com', roles: ['user'] };
      jwtService.verifyAsync.mockResolvedValue(payload);
      const client = makeSocket();

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.emit).toHaveBeenCalledWith(
        NOTIFICATION_EVENTS.CONNECTION_ACK,
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('should join admin and fraud rooms for admin users', async () => {
      const payload = { sub: 'admin-1', email: 'admin@test.com', roles: ['admin'] };
      jwtService.verifyAsync.mockResolvedValue(payload);
      const client = makeSocket({ id: 'admin-socket' });

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user:admin-1');
      expect(client.join).toHaveBeenCalledWith('admin:global');
      expect(client.join).toHaveBeenCalledWith('fraud:alerts');
    });

    it('should disconnect and emit error for invalid token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      const client = makeSocket();

      await gateway.handleConnection(client as any);

      expect(client.emit).toHaveBeenCalledWith('exception', expect.any(Object));
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect when no token provided', async () => {
      const client = makeSocket({
        handshake: { headers: {}, auth: {}, query: {} },
      });

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('should track multi-tab connections for same user', async () => {
      const payload = { sub: 'user-multi', email: 'u@test.com', roles: ['user'] };
      jwtService.verifyAsync.mockResolvedValue(payload);

      const client1 = makeSocket({ id: 'socket-a' });
      const client2 = makeSocket({ id: 'socket-b' });

      await gateway.handleConnection(client1 as any);
      await gateway.handleConnection(client2 as any);

      expect(gateway.isUserOnline('user-multi')).toBe(true);
      expect(gateway.getConnectedSocketCount()).toBeGreaterThanOrEqual(2);
    });
  });

  describe('handleDisconnect', () => {
    it('should remove socket tracking on disconnect', async () => {
      const payload = { sub: 'user-disc', email: 'u@test.com', roles: ['user'] };
      jwtService.verifyAsync.mockResolvedValue(payload);
      const client = makeSocket({ id: 'disc-socket' });

      await gateway.handleConnection(client as any);
      expect(gateway.isUserOnline('user-disc')).toBe(true);

      await gateway.handleDisconnect(client as any);
      expect(gateway.isUserOnline('user-disc')).toBe(false);
    });

    it('should handle disconnect for unknown socket gracefully', async () => {
      const client = makeSocket({ id: 'unknown-socket' });
      await expect(gateway.handleDisconnect(client as any)).resolves.not.toThrow();
    });
  });

  describe('handleSubscribeChannel', () => {
    it('should allow user to join their own channel', async () => {
      const client = makeSocket();
      const result = await gateway.handleSubscribeChannel(client as any, {
        channel: 'user:user-1',
      });
      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(result).toEqual({ success: true, channel: 'user:user-1' });
    });

    it('should allow subscribing to transaction channels', async () => {
      const client = makeSocket();
      const result = await gateway.handleSubscribeChannel(client as any, {
        channel: 'transaction:tx-999',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-admin user subscribing to admin channel', async () => {
      const client = makeSocket();
      await expect(
        gateway.handleSubscribeChannel(client as any, { channel: 'admin:global' }),
      ).rejects.toThrow(WsException);
    });

    it('should allow admin to subscribe to admin channel', async () => {
      const client = makeSocket({
        user: { sub: 'admin-1', email: 'a@test.com', roles: ['admin'] },
      });
      const result = await gateway.handleSubscribeChannel(client as any, {
        channel: 'admin:global',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('handleUnsubscribeChannel', () => {
    it('should leave specified channel', async () => {
      const client = makeSocket();
      const result = await gateway.handleUnsubscribeChannel(client as any, {
        channel: 'transaction:tx-1',
      });
      expect(client.leave).toHaveBeenCalledWith('transaction:tx-1');
      expect(result).toEqual({ success: true, channel: 'transaction:tx-1' });
    });
  });

  describe('handleMissedEvents', () => {
    it('should call deliverMissedEvents with correct params', async () => {
      const client = makeSocket();
      notificationsService.deliverMissedEvents.mockResolvedValue(undefined);

      await gateway.handleMissedEvents(client as any, {
        since: '2024-01-01T00:00:00Z',
        limit: 25,
      });

      expect(notificationsService.deliverMissedEvents).toHaveBeenCalledWith(
        'user-1',
        new Date('2024-01-01T00:00:00Z'),
        25,
      );
    });
  });

  describe('handlePing', () => {
    it('should return pong with timestamp', () => {
      const client = makeSocket();
      const result = gateway.handlePing(client as any);
      expect(result.event).toBe('pong');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('sendHeartbeats', () => {
    it('should emit heartbeat to all connections', () => {
      gateway.sendHeartbeats();
      expect((gateway as any).server.emit).toHaveBeenCalledWith(
        NOTIFICATION_EVENTS.HEARTBEAT,
        expect.objectContaining({ timestamp: expect.any(String) }),
      );
    });

    it('should not throw if server is not initialized', () => {
      (gateway as any).server = null;
      expect(() => gateway.sendHeartbeats()).not.toThrow();
    });
  });

  describe('pruneExpiredNotifications', () => {
    it('should delegate to persistence service', async () => {
      persistence.pruneExpired.mockResolvedValue(5);
      await gateway.pruneExpiredNotifications();
      expect(persistence.pruneExpired).toHaveBeenCalled();
    });
  });

  describe('getOnlineUserCount / getConnectedSocketCount', () => {
    it('should return 0 initially', () => {
      expect(gateway.getOnlineUserCount()).toBe(0);
      expect(gateway.getConnectedSocketCount()).toBe(0);
    });
  });
});
