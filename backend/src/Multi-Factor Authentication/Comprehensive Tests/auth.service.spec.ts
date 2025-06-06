import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    password: 'hashedPassword',
    twoFactorSecret: 'MFRGG2LTOVZGM2LUG5TGC3LBMN2HK3LTG5TGC3LBMFRGG2LTOVZGM2LU',
    twoFactorEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('jwt-token'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('login', () => {
    it('should login successfully without 2FA', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123'
      });

      expect(result).toHaveProperty('access_token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should require 2FA when enabled', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123'
      });

      expect(result).toEqual({
        requiresTwoFactor: true,
        message: '2FA code required'
      });
    });

    it('should login successfully with valid 2FA code', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(true);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
        twoFactorCode: '123456'
      });

      expect(result).toHaveProperty('access_token');
      expect(result.user.twoFactorEnabled).toBe(true);
    });

    it('should reject invalid 2FA code', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(false);

      await expect(service.login({
        email: 'test@example.com',
        password: 'password123',
        twoFactorCode: '000000'
      })).rejects.toThrow(UnauthorizedException);
    });

    it('should reject invalid credentials', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.login({
        email: 'test@example.com',
        password: 'wrongpassword'
      })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('generate2FASecret', () => {
    it('should generate 2FA secret for user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(userRepository, 'update').mockResolvedValue(undefined);

      const result = await service.generate2FASecret(1);

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('manualEntryKey');
      expect(userRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({
        twoFactorSecret: expect.any(String)
      }));
    });

    it('should reject if 2FA already enabled', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA);

      await expect(service.generate2FASecret(1))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('enable2FA', () => {
    it('should enable 2FA with valid code', async () => {
      const userWithSecret = { ...mockUser, twoFactorSecret: 'secret123' };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithSecret);
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(true);
      jest.spyOn(userRepository, 'update').mockResolvedValue(undefined);

      const result = await service.enable2FA(1, { code: '123456' });

      expect(result.enabled).toBe(true);
      expect(userRepository.update).toHaveBeenCalledWith(1, {
        twoFactorEnabled: true
      });
    });

    it('should reject invalid 2FA code during enable', async () => {
      const userWithSecret = { ...mockUser, twoFactorSecret: 'secret123' };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithSecret);
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(false);

      await expect(service.enable2FA(1, { code: '000000' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('disable2FA', () => {
    it('should disable 2FA with valid code', async () => {
      const userWith2FA = { 
        ...mockUser, 
        twoFactorEnabled: true,
        twoFactorSecret: 'secret123'
      };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWith2FA);
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(true);
      jest.spyOn(userRepository, 'update').mockResolvedValue(undefined);

      const result = await service.disable2FA(1, { code: '123456' });

      expect(result.enabled).toBe(false);
      expect(userRepository.update).toHaveBeenCalledWith(1, {
        twoFactorEnabled: false,
        twoFactorSecret: null
      });
    });

    it('should reject if 2FA not enabled', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      await expect(service.disable2FA(1, { code: '123456' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('get2FAStatus', () => {
    it('should return 2FA status', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.get2FAStatus(1);

      expect(result).toEqual({
        twoFactorEnabled: false
      });
    });
  });
});