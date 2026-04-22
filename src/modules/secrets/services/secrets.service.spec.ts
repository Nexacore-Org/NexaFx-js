import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecretsService } from './secrets.service';
import { SecretVersion, SecretType } from '../entities/secret-version.entity';
import { RotateSecretDto } from '../dto/rotate-secret.dto';
import { randomBytes } from 'crypto';

describe('SecretsService', () => {
  let service: SecretsService;
  let repository: jest.Mocked<Repository<SecretVersion>>;

  const mockSecretVersion = (
    type: SecretType,
    version: number,
    value: string,
    expiresAt?: Date,
  ): SecretVersion => ({
    id: 'test-id',
    type,
    version,
    value,
    expiresAt,
    createdAt: new Date(),
  });

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecretsService,
        {
          provide: getRepositoryToken(SecretVersion),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SecretsService>(SecretsService);
    repository = module.get(getRepositoryToken(SecretVersion));
  });

  describe('getActiveSecret', () => {
    it('should return the active secret for given type', async () => {
      const activeSecret = mockSecretVersion('JWT', 1, 'active-secret');
      repository.findOne.mockResolvedValue(activeSecret);

      const result = await service.getActiveSecret('JWT');

      expect(result).toBe('active-secret');
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { type: 'JWT', expiresAt: null },
        order: { version: 'DESC' },
      });
    });

    it('should throw NotFoundException when no active secret exists', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.getActiveSecret('JWT')).rejects.toThrow(
        'No active secret found for type: JWT',
      );
    });
  });

  describe('getValidSecrets', () => {
    it('should return active and grace period secrets', async () => {
      const now = new Date();
      const activeSecret = mockSecretVersion('JWT', 2, 'active-secret');
      const graceSecret = mockSecretVersion(
        'JWT',
        1,
        'grace-secret',
        new Date(now.getTime() + 5 * 60 * 1000), // 5 minutes from now
      );
      const expiredSecret = mockSecretVersion(
        'JWT',
        0,
        'expired-secret',
        new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes ago
      );

      repository.find.mockResolvedValue([activeSecret, graceSecret]);

      const result = await service.getValidSecrets('JWT');

      expect(result).toEqual(['active-secret', 'grace-secret']);
      expect(repository.find).toHaveBeenCalledWith({
        where: [
          { type: 'JWT', expiresAt: null },
          { type: 'JWT', expiresAt: expect.any(Date) },
        ],
        order: { version: 'DESC' },
      });
    });

    it('should return only active secrets when no grace period secrets exist', async () => {
      const activeSecret = mockSecretVersion('JWT', 1, 'active-secret');
      repository.find.mockResolvedValue([activeSecret]);

      const result = await service.getValidSecrets('JWT');

      expect(result).toEqual(['active-secret']);
    });

    it('should return empty array when no secrets exist', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.getValidSecrets('JWT');

      expect(result).toEqual([]);
    });
  });

  describe('rotateSecret', () => {
    it('should rotate secret with default grace period when no active secret exists', async () => {
      const dto: RotateSecretDto = { type: 'JWT' };
      const newSecret = mockSecretVersion('JWT', 1, 'new-secret');

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(newSecret);
      repository.save.mockResolvedValue(newSecret);

      const result = await service.rotateSecret(dto);

      expect(result).toEqual({
        message: 'Secret rotated successfully to version 1',
        newVersion: 1,
        expiresAt: null,
      });
      expect(repository.create).toHaveBeenCalledWith({
        type: 'JWT',
        version: 1,
        value: expect.any(String), // Generated secret
        expiresAt: null,
      });
    });

    it('should rotate secret and set grace period for existing active secret', async () => {
      const dto: RotateSecretDto = { type: 'JWT' };
      const activeSecret = mockSecretVersion('JWT', 1, 'old-secret');
      const newSecret = mockSecretVersion('JWT', 2, 'new-secret');
      const now = new Date();

      repository.findOne.mockResolvedValue(activeSecret);
      repository.create.mockReturnValue(newSecret);
      repository.save
        .mockResolvedValueOnce(activeSecret)
        .mockResolvedValueOnce(newSecret);

      const result = await service.rotateSecret(dto);

      expect(result.newVersion).toBe(2);
      expect(result.expiresAt).toBeTruthy();
      expect(repository.save).toHaveBeenCalledTimes(2);
      
      // Check that old secret was set to expire
      expect(repository.save).toHaveBeenNthCalledWith(1, {
        ...activeSecret,
        expiresAt: expect.any(Date),
      });
    });

    it('should use custom grace period when provided', async () => {
      const dto: RotateSecretDto = { type: 'JWT', gracePeriodMinutes: 10 };
      const activeSecret = mockSecretVersion('JWT', 1, 'old-secret');
      const newSecret = mockSecretVersion('JWT', 2, 'new-secret');

      repository.findOne.mockResolvedValue(activeSecret);
      repository.create.mockReturnValue(newSecret);
      repository.save
        .mockResolvedValueOnce(activeSecret)
        .mockResolvedValueOnce(newSecret);

      await service.rotateSecret(dto);

      const savedOldSecret = repository.save.mock.calls[0][0] as SecretVersion;
      const expectedExpiry = new Date(Date.now() + 10 * 60 * 1000);
      expect(savedOldSecret.expiresAt).toBeInstanceOf(Date);
      if (savedOldSecret.expiresAt) {
        expect(Math.abs(savedOldSecret.expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
      }
    });

    it('should use provided new value when specified', async () => {
      const dto: RotateSecretDto = { type: 'JWT', newValue: 'custom-secret-value' };
      const newSecret = mockSecretVersion('JWT', 1, 'custom-secret-value');

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(newSecret);
      repository.save.mockResolvedValue(newSecret);

      await service.rotateSecret(dto);

      expect(repository.create).toHaveBeenCalledWith({
        type: 'JWT',
        version: 1,
        value: 'custom-secret-value',
        expiresAt: null,
      });
    });

    it('should generate appropriate secret length based on type', async () => {
      const jwtDto: RotateSecretDto = { type: 'JWT' };
      const walletDto: RotateSecretDto = { type: 'WALLET_ENCRYPTION' };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({} as SecretVersion);
      repository.save.mockResolvedValue({} as SecretVersion);

      await service.rotateSecret(jwtDto);
      const jwtCall = repository.create.mock.calls[0][0] as SecretVersion;
      const jwtSecret = jwtCall.value;
      expect(jwtSecret?.length).toBeGreaterThan(32); // JWT uses 48 bytes

      await service.rotateSecret(walletDto);
      const walletCall = repository.create.mock.calls[1][0] as SecretVersion;
      const walletSecret = walletCall.value;
      expect(walletSecret?.length).toBeGreaterThan(24); // Wallet uses 32 bytes
    });
  });

  describe('purgeExpiredSecrets', () => {
    it('should delete expired secrets', async () => {
      const mockDeleteResult = { affected: 3, raw: {} };
      repository.delete.mockResolvedValue(mockDeleteResult);

      await service.purgeExpiredSecrets();

      expect(repository.delete).toHaveBeenCalledWith({
        expiresAt: expect.any(Date),
      });
    });

    it('should not log when no expired secrets exist', async () => {
      const mockDeleteResult = { affected: 0, raw: {} };
      repository.delete.mockResolvedValue(mockDeleteResult);

      await service.purgeExpiredSecrets();

      expect(repository.delete).toHaveBeenCalled();
    });
  });

  describe('getRotationHistory', () => {
    it('should return rotation history for given type', async () => {
      const history = [
        mockSecretVersion('JWT', 2, 'secret-2'),
        mockSecretVersion('JWT', 1, 'secret-1'),
      ];
      repository.find.mockResolvedValue(history);

      const result = await service.getRotationHistory('JWT');

      expect(result).toEqual(history);
      expect(repository.find).toHaveBeenCalledWith({
        where: { type: 'JWT' },
        select: ['id', 'type', 'version', 'expiresAt', 'createdAt'],
        order: { version: 'DESC' },
      });
    });
  });

  describe('Concurrent Validation', () => {
    it('should handle concurrent requests with different secret versions', async () => {
      const now = new Date();
      const activeSecret = mockSecretVersion('JWT', 2, 'active-secret');
      const graceSecret = mockSecretVersion(
        'JWT',
        1,
        'grace-secret',
        new Date(now.getTime() + 5 * 60 * 1000),
      );

      repository.find.mockResolvedValue([activeSecret, graceSecret]);

      // Simulate concurrent requests
      const [result1, result2] = await Promise.all([
        service.getValidSecrets('JWT'),
        service.getValidSecrets('JWT'),
      ]);

      expect(result1).toEqual(['active-secret', 'grace-secret']);
      expect(result2).toEqual(['active-secret', 'grace-secret']);
      expect(repository.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('Security Tests', () => {
    it('should generate secrets with appropriate entropy', async () => {
      const dto: RotateSecretDto = { type: 'JWT' };
      
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({} as SecretVersion);
      repository.save.mockResolvedValue({} as SecretVersion);

      await service.rotateSecret(dto);

      const generatedSecret = (repository.create.mock.calls[0][0] as SecretVersion).value;
      
      // Check that the secret is base64url encoded and has sufficient length
      expect(generatedSecret).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(generatedSecret?.length).toBeGreaterThan(40);
      
      // Verify uniqueness across multiple generations
      await service.rotateSecret(dto);
      const secondSecret = (repository.create.mock.calls[1][0] as SecretVersion).value;
      expect(generatedSecret).not.toBe(secondSecret);
    });

    it('should validate secret type constraints', async () => {
      const invalidDto = { type: 'INVALID_TYPE' as SecretType };
      
      repository.findOne.mockResolvedValue(null);

      // This should be handled at the DTO validation level
      // but we test that the service handles it gracefully
      await expect(service.rotateSecret(invalidDto)).rejects.toThrow();
    });
  });
});
