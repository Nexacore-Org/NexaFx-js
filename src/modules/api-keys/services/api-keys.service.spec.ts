import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyEntity } from '../entities/api-key.entity';

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let repo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: getRepositoryToken(ApiKeyEntity), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    repo = module.get(getRepositoryToken(ApiKeyEntity));
  });

  describe('createApiKey', () => {
    it('should create and return a new API key', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ id: 'key-1', name: 'test-key' });
      repo.save.mockResolvedValue({ id: 'key-1', name: 'test-key' });

      const result = await service.createApiKey('user-1', { name: 'test-key' });

      expect(result.plainKey).toMatch(/^nxf_/);
      expect(result.apiKey).toBeDefined();
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if key name already exists', async () => {
      repo.findOne.mockResolvedValue({ id: 'existing', name: 'test-key' });

      await expect(
        service.createApiKey('user-1', { name: 'test-key' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getApiKeysByUser', () => {
    it('should return all keys for a user', async () => {
      const keys = [{ id: 'k1' }, { id: 'k2' }];
      repo.find.mockResolvedValue(keys);

      const result = await service.getApiKeysByUser('user-1');
      expect(result).toEqual(keys);
    });
  });

  describe('revokeApiKey', () => {
    it('should deactivate an API key', async () => {
      const key = { id: 'k1', isActive: true, userId: 'user-1' };
      repo.findOne.mockResolvedValue(key);
      repo.save.mockImplementation((k) => Promise.resolve(k));

      const result = await service.revokeApiKey('k1', 'user-1');
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if key not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.revokeApiKey('nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if key belongs to different user', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.revokeApiKey('k1', 'other-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateApiKey', () => {
    it('should return the key if valid', async () => {
      const key = { id: 'k1', isActive: true, expiresAt: null, lastUsedAt: null };
      repo.findOne.mockResolvedValue(key);
      repo.save.mockImplementation((k) => Promise.resolve(k));

      // We need to create a known key and hash it to test validation
      const result = await service.validateApiKey('any-key');
      expect(result).toBeDefined();
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if key not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.validateApiKey('bad-key')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if key is expired', async () => {
      const key = {
        id: 'k1',
        isActive: true,
        expiresAt: new Date('2020-01-01'),
        lastUsedAt: null,
      };
      repo.findOne.mockResolvedValue(key);
      repo.save.mockImplementation((k) => Promise.resolve(k));

      await expect(service.validateApiKey('any-key')).rejects.toThrow(UnauthorizedException);
    });
  });
});
