import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { SessionService } from '../services/session.service';
import { Session } from '../entities/session.entity';
import { UnauthorizedException } from '@nestjs/common';

describe('SessionService', () => {
  let service: SessionService;
  let repository: Repository<Session>;
  let jwtService: JwtService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verifyAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(Session),
          useValue: mockRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    repository = module.get<Repository<Session>>(getRepositoryToken(Session));
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockToken = 'mock.jwt.token';
      const mockUser = { id: '1', username: 'testuser' };
      
      mockJwtService.sign.mockReturnValue(mockToken);
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockResolvedValue({});

      const result = await service.login('testuser', 'testpass');

      expect(result.accessToken).toBe(mockToken);
      expect(result.user).toEqual(mockUser);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      await expect(service.login('invalid', 'invalid')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('blacklistToken', () => {
    it('should blacklist a token', async () => {
      const token = 'test.token';
      mockRepository.update.mockResolvedValue({});

      await service.blacklistToken(token);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { token },
        { isBlacklisted: true }
      );
    });
  });

  describe('isTokenBlacklisted', () => {
    it('should return true for blacklisted token', async () => {
      const token = 'blacklisted.token';
      mockRepository.findOne.mockResolvedValue({ isBlacklisted: true });

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(true);
    });

    it('should return false for non-blacklisted token', async () => {
      const token = 'valid.token';
      mockRepository.findOne.mockResolvedValue({ isBlacklisted: false });

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(false);
    });

    it('should return false for non-existent token', async () => {
      const token = 'nonexistent.token';
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(false);
    });
  });

  describe('logout', () => {
    it('should successfully logout by blacklisting token', async () => {
      const token = 'test.token';
      mockRepository.update.mockResolvedValue({});

      await service.logout(token);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { token },
        { isBlacklisted: true }
      );
    });
  });

  describe('invalidateUserSessions', () => {
    it('should invalidate all user sessions', async () => {
      const userId = 'user123';
      mockRepository.update.mockResolvedValue({});

      await service.invalidateUserSessions(userId);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { userId, isBlacklisted: false },
        { isBlacklisted: true }
      );
    });
  });
});
