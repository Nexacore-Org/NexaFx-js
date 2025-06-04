import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from './user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccountLockoutService } from './account-lockout.service';
import { AccountLockoutGuard } from './account-lockout.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountLockoutService, AccountLockoutGuard],
  exports: [AccountLockoutService, AccountLockoutGuard],
})
export class AuthModule {}

// File: src/auth/tests/account-lockout.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountLockoutService } from './account-lockout.service';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

describe('Account Lockout Policy', () => {
  let accountLockoutService: AccountLockoutService;
  let authService: AuthService;
  let userRepository: Repository<User>;
  let testUser: User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountLockoutService,
        AuthService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
          },
        },
      ],
    }).compile();

    accountLockoutService = module.get<AccountLockoutService>(AccountLockoutService);
    authService = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));

    // Create test user
    testUser = new User();
    testUser.id = 1;
    testUser.email = 'test@example.com';
    testUser.password = await bcrypt.hash('password123', 10);
    testUser.failedLoginAttempts = 0;
    testUser.lockedUntil = null;
  });

  describe('Failed Login Attempts', () => {
    it('should increment failed attempts on wrong password', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(testUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(testUser);

      const result = await accountLockoutService.handleFailedLogin(testUser.id);

      expect(result.isLocked).toBe(false);
      expect(result.attemptsRemaining).toBe(4);
      expect(testUser.failedLoginAttempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      testUser.failedLoginAttempts = 4; // Already 4 failed attempts
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(testUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(testUser);

      const result = await accountLockoutService.handleFailedLogin(testUser.id);

      expect(result.isLocked).toBe(true);
      expect(result.attemptsRemaining).toBe(0);
      expect(testUser.failedLoginAttempts).toBe(5);
      expect(testUser.lockedUntil).toBeDefined();
      expect(testUser.lockedUntil.getTime()).toBeGreaterThan(new Date().getTime());
    });
  });

  describe('Account Lockout', () => {
    it('should prevent login when account is locked', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 30);
      testUser.lockedUntil = futureDate;
      testUser.failedLoginAttempts = 5;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(testUser);

      const isLocked = await accountLockoutService.isAccountLocked(testUser.id);
      expect(isLocked).toBe(true);
    });

    it('should auto-unlock account after cooldown period', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 30);
      testUser.lockedUntil = pastDate;
      testUser.failedLoginAttempts = 5;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(testUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(testUser);

      const isLocked = await accountLockoutService.isAccountLocked(testUser.id);
      expect(isLocked).toBe(false);
      expect(testUser.failedLoginAttempts).toBe(0);
      expect(testUser.lockedUntil).toBeNull();
    });
  });

  describe('Successful Login', () => {
    it('should reset failed attempts on successful login', async () => {
      testUser.failedLoginAttempts = 3;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(testUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(testUser);

      await accountLockoutService.handleSuccessfulLogin(testUser.id);

      expect(testUser.failedLoginAttempts).toBe(0);
      expect(testUser.lockedUntil).toBeNull();
    });
  });

  describe('Integration Test - Multiple Failed Logins', () => {
    it('should lock account after 5+ failed login attempts', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(testUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(testUser);

      // Simulate 6 failed login attempts
      for (let i = 0; i < 6; i++) {
        try {
          await authService.login('test@example.com', 'wrongpassword');
        } catch (error) {
          // Expected to throw UnauthorizedException
          expect(error.message).toContain('Invalid credentials');
        }
      }

      // Check if account is locked
      const isLocked = await accountLockoutService.isAccountLocked(testUser.id);
      expect(isLocked).toBe(true);
      expect(testUser.failedLoginAttempts).toBeGreaterThanOrEqual(5);
    });
  });
});
