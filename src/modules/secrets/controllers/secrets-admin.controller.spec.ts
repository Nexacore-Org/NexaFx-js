import { Test, TestingModule } from '@nestjs/testing';
import { SecretsAdminController } from './secrets-admin.controller';
import { SecretsService } from '../services/secrets.service';
import { RotateSecretDto } from '../dto/rotate-secret.dto';
import { SecretType, SecretVersion } from '../entities/secret-version.entity';

describe('SecretsAdminController', () => {
  let controller: SecretsAdminController;
  let service: jest.Mocked<SecretsService>;

  beforeEach(async () => {
    const mockSecretsService = {
      rotateSecret: jest.fn(),
      getRotationHistory: jest.fn(),
      getActiveSecret: jest.fn(),
      getValidSecrets: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecretsAdminController],
      providers: [
        {
          provide: SecretsService,
          useValue: mockSecretsService,
        },
      ],
    }).compile();

    controller = module.get<SecretsAdminController>(SecretsAdminController);
    service = module.get(SecretsService);
  });

  describe('rotate', () => {
    it('should rotate JWT secret successfully', async () => {
      const dto: RotateSecretDto = { type: 'JWT' };
      const expectedResult = {
        message: 'Secret rotated successfully to version 2',
        newVersion: 2,
        expiresAt: new Date(),
      };

      service.rotateSecret.mockResolvedValue(expectedResult);

      const result = await controller.rotate(dto);

      expect(result).toEqual(expectedResult);
      expect(service.rotateSecret).toHaveBeenCalledWith(dto);
    });

    it('should rotate WALLET_ENCRYPTION secret with custom grace period', async () => {
      const dto: RotateSecretDto = {
        type: 'WALLET_ENCRYPTION',
        gracePeriodMinutes: 10,
        newValue: 'custom-encryption-key',
      };
      const expectedResult = {
        message: 'Secret rotated successfully to version 3',
        newVersion: 3,
        expiresAt: new Date(),
      };

      service.rotateSecret.mockResolvedValue(expectedResult);

      const result = await controller.rotate(dto);

      expect(result).toEqual(expectedResult);
      expect(service.rotateSecret).toHaveBeenCalledWith(dto);
    });

    it('should rotate WEBHOOK secret with provided value', async () => {
      const dto: RotateSecretDto = {
        type: 'WEBHOOK',
        newValue: 'webhook-signing-secret-123',
      };
      const expectedResult = {
        message: 'Secret rotated successfully to version 1',
        newVersion: 1,
        expiresAt: null,
      };

      service.rotateSecret.mockResolvedValue(expectedResult);

      const result = await controller.rotate(dto);

      expect(result).toEqual(expectedResult);
      expect(service.rotateSecret).toHaveBeenCalledWith(dto);
    });
  });

  describe('history', () => {
    it('should return rotation history for JWT secrets', async () => {
      const type: SecretType = 'JWT';
      const mockHistory = [
        {
          id: 'secret-2',
          type: 'JWT' as SecretType,
          version: 2,
          value: 'active-secret',
          expiresAt: null,
          createdAt: new Date('2024-01-02T10:00:00Z'),
        },
        {
          id: 'secret-1',
          type: 'JWT' as SecretType,
          version: 1,
          value: 'old-secret',
          expiresAt: new Date('2024-01-02T10:05:00Z'),
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ] as SecretVersion[];

      service.getRotationHistory.mockResolvedValue(mockHistory);

      const result = await controller.history(type);

      expect(result).toEqual(mockHistory);
      expect(service.getRotationHistory).toHaveBeenCalledWith(type);
    });

    it('should return rotation history for WALLET_ENCRYPTION secrets', async () => {
      const type: SecretType = 'WALLET_ENCRYPTION';
      const mockHistory = [
        {
          id: 'wallet-secret-1',
          type: 'WALLET_ENCRYPTION' as SecretType,
          version: 1,
          value: 'wallet-encryption-key',
          expiresAt: null,
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ] as SecretVersion[];

      service.getRotationHistory.mockResolvedValue(mockHistory);

      const result = await controller.history(type);

      expect(result).toEqual(mockHistory);
      expect(service.getRotationHistory).toHaveBeenCalledWith(type);
    });

    it('should return empty history when no secrets exist', async () => {
      const type: SecretType = 'WEBHOOK';
      service.getRotationHistory.mockResolvedValue([]);

      const result = await controller.history(type);

      expect(result).toEqual([]);
      expect(service.getRotationHistory).toHaveBeenCalledWith(type);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete secret rotation workflow', async () => {
      // Initial state: no active secret
      const initialRotateDto: RotateSecretDto = { type: 'JWT' };
      const initialResult = {
        message: 'Secret rotated successfully to version 1',
        newVersion: 1,
        expiresAt: null,
      };

      service.rotateSecret.mockResolvedValue(initialResult);

      // Rotate first time
      const firstRotation = await controller.rotate(initialRotateDto);
      expect(firstRotation.newVersion).toBe(1);

      // Second rotation with grace period
      const secondRotateDto: RotateSecretDto = {
        type: 'JWT',
        gracePeriodMinutes: 5,
      };
      const secondResult = {
        message: 'Secret rotated successfully to version 2',
        newVersion: 2,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };

      service.rotateSecret.mockResolvedValue(secondResult);

      const secondRotation = await controller.rotate(secondRotateDto);
      expect(secondRotation.newVersion).toBe(2);
      expect(secondRotation.expiresAt).toBeTruthy();

      // Check history
      const mockHistory = [
        {
          id: 'secret-2',
          type: 'JWT' as SecretType,
          version: 2,
          value: 'new-secret',
          expiresAt: null,
          createdAt: new Date(),
        },
        {
          id: 'secret-1',
          type: 'JWT' as SecretType,
          version: 1,
          value: 'old-secret',
          expiresAt: secondRotation.expiresAt,
          createdAt: new Date(Date.now() - 60 * 1000),
        },
      ] as SecretVersion[];

      service.getRotationHistory.mockResolvedValue(mockHistory);

      const history = await controller.history('JWT');
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2);
      expect(history[1].version).toBe(1);
    });

    it('should validate secret types are properly handled', async () => {
      const secretTypes: SecretType[] = ['JWT', 'WALLET_ENCRYPTION', 'WEBHOOK'];
      
      for (const type of secretTypes) {
        const dto: RotateSecretDto = { type };
        const result = {
          message: `Secret rotated successfully to version 1`,
          newVersion: 1,
          expiresAt: null,
        };

        service.rotateSecret.mockResolvedValue(result);

        const rotationResult = await controller.rotate(dto);
        expect(rotationResult.newVersion).toBe(1);
        expect(service.rotateSecret).toHaveBeenCalledWith(dto);
      }

      expect(service.rotateSecret).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const dto: RotateSecretDto = { type: 'JWT' };
      const error = new Error('Service unavailable');

      service.rotateSecret.mockRejectedValue(error);

      await expect(controller.rotate(dto)).rejects.toThrow('Service unavailable');
    });

    it('should handle validation errors from service', async () => {
      const dto: RotateSecretDto = { type: 'JWT' };
      const error = new Error('Invalid secret type');

      service.rotateSecret.mockRejectedValue(error);

      await expect(controller.rotate(dto)).rejects.toThrow('Invalid secret type');
    });
  });
});
