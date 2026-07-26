import { of, throwError } from 'rxjs';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PushNotificationService } from './push.service';
import { DeviceToken, DevicePlatform } from '../device-token.entity';

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let tokenRepo: jest.Mocked<Pick<Repository<DeviceToken>, 'findOne' | 'find' | 'create' | 'save' | 'delete'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let http: jest.Mocked<Pick<HttpService, 'post'>>;

  const makeToken = (overrides?: Partial<DeviceToken>): DeviceToken => ({
    id: 'dt-1',
    userId: 'user-1',
    token: 'tok-abc',
    platform: DevicePlatform.ANDROID,
    createdAt: new Date(),
    lastUsedAt: undefined as any,
    ...overrides,
  });

  beforeEach(() => {
    tokenRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() } as any;
    config = { get: jest.fn().mockReturnValue('server-key') } as any;
    http = { post: jest.fn() } as any;
    service = new PushNotificationService(tokenRepo as any, config as any, http as any);
  });

  describe('registerToken()', () => {
    it('updates existing token record when token already exists', async () => {
      const existing = makeToken();
      tokenRepo.findOne.mockResolvedValue(existing);
      tokenRepo.save.mockResolvedValue({ ...existing, userId: 'user-2' });

      const result = await service.registerToken('user-2', 'tok-abc', DevicePlatform.ANDROID);

      expect(result.userId).toBe('user-2');
      expect(tokenRepo.save).toHaveBeenCalled();
    });

    it('creates a new token record when token does not exist', async () => {
      const newToken = makeToken({ userId: 'user-3', token: 'tok-new' });
      tokenRepo.findOne.mockResolvedValue(null);
      tokenRepo.create.mockReturnValue(newToken);
      tokenRepo.save.mockResolvedValue(newToken);

      const result = await service.registerToken('user-3', 'tok-new', DevicePlatform.IOS);

      expect(tokenRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-3', token: 'tok-new' }));
      expect(result).toEqual(newToken);
    });
  });

  describe('deregisterToken()', () => {
    it('deletes the token by value', async () => {
      tokenRepo.delete.mockResolvedValue({ affected: 1 } as any);
      await service.deregisterToken('tok-abc');
      expect(tokenRepo.delete).toHaveBeenCalledWith({ token: 'tok-abc' });
    });
  });

  describe('sendToUser()', () => {
    it('sends FCM push to all registered Android tokens', async () => {
      const token = makeToken({ platform: DevicePlatform.ANDROID });
      tokenRepo.find.mockResolvedValue([token]);
      tokenRepo.save.mockResolvedValue(token);
      http.post.mockReturnValue(of({ data: {} }) as any);

      await service.sendToUser('user-1', { title: 'Hello', body: 'World' });

      expect(http.post).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/fcm/send',
        expect.objectContaining({ to: 'tok-abc' }),
        expect.any(Object),
      );
    });

    it('removes stale token when FCM responds with NotRegistered error', async () => {
      const token = makeToken({ platform: DevicePlatform.ANDROID });
      tokenRepo.find.mockResolvedValue([token]);
      tokenRepo.delete.mockResolvedValue({ affected: 1 } as any);
      http.post.mockReturnValue(
        throwError(() => ({ response: { data: { error: 'NotRegistered' } } })),
      );

      await service.sendToUser('user-1', { title: 'Hi', body: 'Test' });

      expect(tokenRepo.delete).toHaveBeenCalledWith({ token: 'tok-abc' });
    });
  });
});
