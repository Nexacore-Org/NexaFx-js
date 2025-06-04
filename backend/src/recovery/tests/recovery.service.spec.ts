import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { RecoveryService } from '../recovery.service';
import { PasswordReset } from '../entities/password-reset.entity';

describe('RecoveryService', () => {
  let service: RecoveryService;
  let repository: Repository<PasswordReset>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoveryService,
        {
          provide: getRepositoryToken(PasswordReset),
          useValue: mockRepository,
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RecoveryService>(RecoveryService);
    repository = module.get<Repository<PasswordReset>>(
      getRepositoryToken(PasswordReset),
    );
  });

  describe('requestPasswordReset', () => {
    it('should create password reset token', async () => {
      const email = 'test@example.com';
      const mockPasswordReset = { id: '1', email, token: 'mock-token' };

      mockRepository.create.mockReturnValue(mockPasswordReset);
      mockRepository.save.mockResolvedValue(mockPasswordReset);

      const result = await service.requestPasswordReset({ email });

      expect(result.message).toBe(
        'Password reset instructions sent to your email',
      );
      expect(result.token).toBeDefined();
      expect(mockRepository.update).toHaveBeenCalledWith(
        { email, used: false },
        { used: true },
      );
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      const mockPasswordReset = {
        id: '1',
        email: 'test@example.com',
        token: 'valid-token',
        used: false,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };

      mockRepository.findOne.mockResolvedValue(mockPasswordReset);
      mockRepository.save.mockResolvedValue({
        ...mockPasswordReset,
        used: true,
      });

      const result = await service.resetPassword({
        token: 'valid-token',
        newPassword: 'NewPassword123!',
      });

      expect(result.message).toBe('Password reset successful');
      expect(mockRepository.save).toHaveBeenCalledWith({
        ...mockPasswordReset,
        used: true,
      });
    });

    it('should throw error for invalid token', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateToken', () => {
    it('should return valid for unexpired token', async () => {
      const mockPasswordReset = {
        email: 'test@example.com',
        token: 'valid-token',
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockRepository.findOne.mockResolvedValue(mockPasswordReset);

      const result = await service.validateToken('valid-token');

      expect(result.valid).toBe(true);
      expect(result.email).toBe('test@example.com');
    });

    it('should return invalid for non-existent token', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.validateToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.email).toBeUndefined();
    });
  });
});
