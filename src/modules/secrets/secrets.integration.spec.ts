import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecretsModule } from './secrets.module';
import { SecretsService } from './services/secrets.service';
import { SecretVersion, SecretType } from './entities/secret-version.entity';
import { SecretsAdminController } from './controllers/secrets-admin.controller';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

describe('SecretsService Integration Tests', () => {
  let module: TestingModule;
  let service: SecretsService;
  let controller: SecretsAdminController;
  let jwtGuard: JwtAuthGuard;

  beforeAll(async () => {
    // Use in-memory SQLite for testing
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [SecretVersion],
          synchronize: true,
          logging: false,
        }),
        SecretsModule,
      ],
    }).compile();

    service = module.get<SecretsService>(SecretsService);
    controller = module.get<SecretsAdminController>(SecretsAdminController);
    jwtGuard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    const repository = module.get('SecretVersionRepository');
    await repository.clear();
  });

  describe('Complete Secret Rotation Workflow', () => {
    it('should handle full rotation lifecycle with grace period', async () => {
      const secretType: SecretType = 'JWT';
      
      // Step 1: Create initial secret
      const initialRotateDto = { type: secretType };
      const initialResult = await service.rotateSecret(initialRotateDto);
      
      expect(initialResult.newVersion).toBe(1);
      expect(initialResult.expiresAt).toBeNull();

      // Step 2: Verify initial secret is active
      const activeSecret = await service.getActiveSecret(secretType);
      expect(activeSecret).toBeTruthy();
      expect(activeSecret.length).toBeGreaterThan(40);

      // Step 3: Rotate to new version with grace period
      const rotateDto = { 
        type: secretType, 
        gracePeriodMinutes: 5 
      };
      const rotationResult = await service.rotateSecret(rotateDto);
      
      expect(rotationResult.newVersion).toBe(2);
      expect(rotationResult.expiresAt).toBeTruthy();

      // Step 4: Verify both secrets are valid during grace period
      const validSecrets = await service.getValidSecrets(secretType);
      expect(validSecrets).toHaveLength(2);
      expect(validSecrets[0]).not.toBe(validSecrets[1]); // Different secrets

      // Step 5: Verify new secret is the active one
      const newActiveSecret = await service.getActiveSecret(secretType);
      expect(newActiveSecret).toBe(validSecrets[0]); // Should be the newest

      // Step 6: Test JWT token validation with both secrets
      const testPayload = { userId: 'test-user', email: 'test@example.com' };
      const oldToken = jwt.sign(testPayload, validSecrets[1]); // Signed with old secret
      const newToken = jwt.sign(testPayload, validSecrets[0]); // Signed with new secret

      // Both tokens should be valid during grace period
      expect(() => jwt.verify(oldToken, validSecrets[1])).not.toThrow();
      expect(() => jwt.verify(newToken, validSecrets[0])).not.toThrow();

      // Step 7: Check rotation history
      const history = await service.getRotationHistory(secretType);
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2);
      expect(history[1].version).toBe(1);
      expect(history[1].expiresAt).toBeTruthy();
    });

    it('should handle concurrent requests during rotation', async () => {
      const secretType: SecretType = 'JWT';
      
      // Create initial secret
      await service.rotateSecret({ type: secretType });
      
      // Rotate with grace period
      await service.rotateSecret({ type: secretType, gracePeriodMinutes: 10 });
      
      // Simulate concurrent requests for valid secrets
      const concurrentRequests = Array.from({ length: 10 }, () => 
        service.getValidSecrets(secretType)
      );
      
      const results = await Promise.all(concurrentRequests);
      
      // All requests should return the same result
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toEqual(firstResult);
        expect(result).toHaveLength(2); // Active + grace period
      });
    });
  });

  describe('JWT Guard Integration', () => {
    it('should validate tokens signed with both old and new secrets during grace period', async () => {
      const secretType: SecretType = 'JWT';
      
      // Create initial secret and rotate
      await service.rotateSecret({ type: secretType });
      await service.rotateSecret({ type: secretType, gracePeriodMinutes: 5 });
      
      const validSecrets = await service.getValidSecrets(secretType);
      expect(validSecrets).toHaveLength(2);
      
      const testPayload = { sub: 'user-123', email: 'user@example.com' };
      const oldToken = jwt.sign(testPayload, validSecrets[1]);
      const newToken = jwt.sign(testPayload, validSecrets[0]);
      
      // Mock request context
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${oldToken}` }
          })
        })
      } as any;
      
      // Test with old token (should work during grace period)
      let result = await jwtGuard.canActivate(mockContext);
      expect(result).toBe(true);
      
      // Test with new token
      mockContext.switchToHttp().getRequest().headers.authorization = `Bearer ${newToken}`;
      result = await jwtGuard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should reject tokens signed with expired secrets', async () => {
      const secretType: SecretType = 'JWT';
      
      // Create and rotate secret
      await service.rotateSecret({ type: secretType });
      await service.rotateSecret({ type: secretType, gracePeriodMinutes: 1 });
      
      // Wait for grace period to expire (simulate by manually setting expiresAt)
      const repository = module.get('SecretVersionRepository');
      const oldSecret = await repository.findOne({ 
        where: { type: secretType, version: 1 } 
      });
      
      if (oldSecret) {
        oldSecret.expiresAt = new Date(Date.now() - 60 * 1000); // 1 minute ago
        await repository.save(oldSecret);
      }
      
      const validSecrets = await service.getValidSecrets(secretType);
      expect(validSecrets).toHaveLength(1); // Only active secret
      
      const testPayload = { sub: 'user-123', email: 'user@example.com' };
      const expiredToken = jwt.sign(testPayload, 'expired-secret');
      
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${expiredToken}` }
          })
        })
      } as any;
      
      // Should reject expired token
      await expect(jwtGuard.canActivate(mockContext)).rejects.toThrow('Invalid or expired JWT token');
    });
  });

  describe('Admin Controller Integration', () => {
    it('should handle rotation through controller endpoint', async () => {
      const rotateDto = { 
        type: 'JWT' as SecretType, 
        gracePeriodMinutes: 10,
        newValue: randomBytes(32).toString('base64url')
      };
      
      const result = await controller.rotate(rotateDto);
      
      expect(result.message).toContain('rotated successfully');
      expect(result.newVersion).toBe(1);
      expect(result.expiresAt).toBeNull();
      
      // Verify secret exists and is active
      const activeSecret = await service.getActiveSecret('JWT');
      expect(activeSecret).toBe(rotateDto.newValue);
    });

    it('should provide rotation history through controller', async () => {
      const secretType: SecretType = 'JWT';
      
      // Create multiple rotations
      await service.rotateSecret({ type: secretType });
      await service.rotateSecret({ type: secretType, gracePeriodMinutes: 5 });
      await service.rotateSecret({ type: secretType, gracePeriodMinutes: 3 });
      
      const history = await controller.history(secretType);
      
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(3);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(1);
      
      // Check grace periods
      expect(history[0].expiresAt).toBeNull(); // Active
      expect(history[1].expiresAt).toBeTruthy(); // In grace period
      expect(history[2].expiresAt).toBeTruthy(); // Expired or in grace period
    });
  });

  describe('Security and Encryption', () => {
    it('should store secrets encrypted at rest', async () => {
      const secretType: SecretType = 'WALLET_ENCRYPTION';
      const secretValue = 'super-secret-encryption-key';
      
      await service.rotateSecret({ type: secretType, newValue: secretValue });
      
      const repository = module.get('SecretVersionRepository');
      const storedSecret = await repository.findOne({ 
        where: { type: secretType, version: 1 } 
      });
      
      expect(storedSecret).toBeTruthy();
      expect(storedSecret.value).not.toBe(secretValue); // Should be encrypted
      expect(storedSecret.value).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 encoded
      
      // But service should return decrypted value
      const activeSecret = await service.getActiveSecret(secretType);
      expect(activeSecret).toBe(secretValue);
    });

    it('should generate secrets with proper entropy', async () => {
      const secretTypes: SecretType[] = ['JWT', 'WALLET_ENCRYPTION', 'WEBHOOK'];
      
      for (const type of secretTypes) {
        await service.rotateSecret({ type });
        const secret = await service.getActiveSecret(type);
        
        // Check base64url encoding
        expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
        
        // Check length (JWT should be longer)
        if (type === 'JWT') {
          expect(secret.length).toBeGreaterThan(60);
        } else {
          expect(secret.length).toBeGreaterThan(40);
        }
        
        // Check uniqueness
        const secondSecret = await service.rotateSecret({ type });
        expect(secret).not.toBe(secondSecret);
      }
    });
  });

  describe('Grace Period Expiry', () => {
    it('should automatically purge expired secrets', async () => {
      const secretType: SecretType = 'JWT';
      
      // Create and rotate secret
      await service.rotateSecret({ type: secretType });
      await service.rotateSecret({ type: secretType, gracePeriodMinutes: 1 });
      
      // Manually set old secret as expired
      const repository = module.get('SecretVersionRepository');
      const oldSecret = await repository.findOne({ 
        where: { type: secretType, version: 1 } 
      });
      
      if (oldSecret) {
        oldSecret.expiresAt = new Date(Date.now() - 60 * 1000); // 1 minute ago
        await repository.save(oldSecret);
      }
      
      // Run purge job
      await service.purgeExpiredSecrets();
      
      // Verify only active secret remains
      const validSecrets = await service.getValidSecrets(secretType);
      expect(validSecrets).toHaveLength(1);
      
      const remainingSecret = await repository.findOne({ 
        where: { type: secretType, version: 1 } 
      });
      expect(remainingSecret).toBeNull(); // Should be purged
    });
  });
});
