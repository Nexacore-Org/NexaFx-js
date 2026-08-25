import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from '../services/api-keys.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

const MockGuard = { canActivate: () => true };

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: Partial<Record<keyof ApiKeysService, jest.Mock>>;

  beforeEach(async () => {
    service = {
      createApiKey: jest.fn(),
      getApiKeysByUser: jest.fn(),
      revokeApiKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        { provide: ApiKeysService, useValue: service },
        { provide: JwtAuthGuard, useValue: MockGuard },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: Reflector, useValue: {} },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue(MockGuard)
    .compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
  });

  describe('create', () => {
    it('should create a key and return it with the plain key', async () => {
      const mockKey = { id: 'k1', name: 'test', userId: 'u1' } as any;
      service.createApiKey!.mockResolvedValue({ apiKey: mockKey, plainKey: 'nxf_abc123' });

      const req = { user: { id: 'u1' } };
      const result = await controller.create({ name: 'test' } as any, req);

      expect(result.success).toBe(true);
      expect(result.data.key).toBe('nxf_abc123');
      expect(result.message).toContain('Store this key securely');
      expect(service.createApiKey).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'test' }));
    });

    it('should use user.sub if user.id is not set', async () => {
      const mockKey = { id: 'k2', name: 'test2', userId: 'u2' } as any;
      service.createApiKey!.mockResolvedValue({ apiKey: mockKey, plainKey: 'nxf_def456' });

      const req = { user: { sub: 'u2' } };
      await controller.create({ name: 'test2' } as any, req);

      expect(service.createApiKey).toHaveBeenCalledWith('u2', expect.objectContaining({ name: 'test2' }));
    });
  });

  describe('list', () => {
    it('should return all keys for the user', async () => {
      const keys = [{ id: 'k1' }, { id: 'k2' }];
      service.getApiKeysByUser!.mockResolvedValue(keys);

      const req = { user: { id: 'u1' } };
      const result = await controller.list(req);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(keys);
    });
  });

  describe('revoke', () => {
    it('should revoke a key', async () => {
      const revoked = { id: 'k1', isActive: false };
      service.revokeApiKey!.mockResolvedValue(revoked);

      const req = { user: { id: 'u1' } };
      const result = await controller.revoke('k1', req);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(revoked);
      expect(service.revokeApiKey).toHaveBeenCalledWith('k1', 'u1');
    });
  });
});
