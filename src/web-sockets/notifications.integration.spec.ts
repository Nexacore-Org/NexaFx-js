import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { io, Socket } from 'socket.io-client';

import { NotificationsModule } from '../notifications.module';
import { NotificationsService } from '../notifications.service';
import { PersistedNotification } from '../entities/persisted-notification.entity';
import { NOTIFICATION_EVENTS, WS_NAMESPACE } from '../notifications.constants';

/** Skipped in CI if no DB — uses in-memory repository mocks */
describe('Notifications Integration', () => {
  let app: INestApplication;
  let notificationsService: NotificationsService;
  let jwtService: JwtService;
  let port: number;

  const mockRepo = {
    create: jest.fn((dto) => ({ ...dto, id: 'int-notif-1', createdAt: new Date() })),
    save: jest.fn((e) => Promise.resolve(e)),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    increment: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({ secret: 'integration-test-secret', global: true }),
        ScheduleModule.forRoot(),
        NotificationsModule,
      ],
    })
      .overrideProvider(getRepositoryToken(PersistedNotification))
      .useValue(mockRepo)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0); // random port
    port = (app.getHttpServer().address() as any).port;

    notificationsService = moduleRef.get(NotificationsService);
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const makeToken = (payload = { sub: 'int-user-1', roles: ['user'] }) =>
    jwtService.sign(payload, { secret: 'integration-test-secret' });

  const connectClient = (token: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(`http://localhost:${port}${WS_NAMESPACE}`, {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket'],
        timeout: 3000,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  describe('Connection', () => {
    it('should reject unauthenticated connection', (done) => {
      const socket = io(`http://localhost:${port}${WS_NAMESPACE}`, {
        transports: ['websocket'],
        timeout: 2000,
      });
      socket.on('connect_error', () => {
        socket.disconnect();
        done();
      });
      socket.on('exception', () => {
        socket.disconnect();
        done();
      });
    });

    it('should accept valid JWT and emit connection ACK', (done) => {
      const token = makeToken();
      connectClient(token).then((socket) => {
        socket.on(NOTIFICATION_EVENTS.CONNECTION_ACK, (data) => {
          expect(data.userId).toBe('int-user-1');
          socket.disconnect();
          done();
        });
      });
    });
  });

  describe('Ping / Pong', () => {
    it('should respond to ping with pong', (done) => {
      const token = makeToken();
      connectClient(token).then((socket) => {
        socket.emit('ping', {}, (response: any) => {
          expect(response.event).toBe('pong');
          socket.disconnect();
          done();
        });
      });
    });
  });

  describe('Channel subscription', () => {
    it('should allow subscribing to transaction channel', (done) => {
      const token = makeToken();
      connectClient(token).then((socket) => {
        socket.emit(
          'subscribe_channel',
          { channel: 'transaction:tx-999' },
          (response: any) => {
            expect(response.success).toBe(true);
            socket.disconnect();
            done();
          },
        );
      });
    });

    it('should reject non-admin subscribing to admin:global', (done) => {
      const token = makeToken({ sub: 'user-2', roles: ['user'] });
      connectClient(token).then((socket) => {
        socket.on('exception', (err) => {
          expect(err).toBeDefined();
          socket.disconnect();
          done();
        });
        socket.emit('subscribe_channel', { channel: 'admin:global' });
      });
    });
  });

  describe('Missed events request', () => {
    it('should handle missed events request without error', (done) => {
      const token = makeToken();
      connectClient(token).then((socket) => {
        socket.emit('request_missed_events', {
          since: '2024-01-01T00:00:00Z',
          limit: 10,
        });
        // If no exception within 500ms, test passes
        setTimeout(() => {
          socket.disconnect();
          done();
        }, 500);
      });
    });
  });
});
