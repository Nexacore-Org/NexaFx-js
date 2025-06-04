import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 30; // 30 minutes cooldown

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async handleFailedLogin(userId: number): Promise<{ isLocked: boolean; attemptsRemaining: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Increment failed attempts
    user.failedLoginAttempts += 1;
    
    let isLocked = false;
    
    // Check if we should lock the account
    if (user.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = new Date();
      lockoutUntil.setMinutes(lockoutUntil.getMinutes() + this.LOCKOUT_DURATION_MINUTES);
      
      user.lockedUntil = lockoutUntil;
      isLocked = true;
      
      this.logger.warn(`Account locked for user ${user.email} until ${lockoutUntil}`);
    }

    await this.userRepository.save(user);
    
    return {
      isLocked,
      attemptsRemaining: Math.max(0, this.MAX_FAILED_ATTEMPTS - user.failedLoginAttempts)
    };
  }

  async handleSuccessfulLogin(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Reset failed attempts and unlock account on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    
    await this.userRepository.save(user);
    this.logger.log(`Login attempts reset for user ${user.email}`);
  }

  async isAccountLocked(userId: number): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return false;
    }

    // Check if account is locked and if lockout period has expired
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return true;
    }

    // Auto-unlock if lockout period has expired
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await this.unlockAccount(userId);
      return false;
    }

    return false;
  }

  async unlockAccount(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    
    await this.userRepository.save(user);
    this.logger.log(`Account unlocked for user ${user.email}`);
  }

  async getLockoutInfo(userId: number): Promise<{ isLocked: boolean; lockedUntil?: Date; attemptsRemaining: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const isLocked = await this.isAccountLocked(userId);
    
    return {
      isLocked,
      lockedUntil: user.lockedUntil,
      attemptsRemaining: Math.max(0, this.MAX_FAILED_ATTEMPTS - user.failedLoginAttempts)
    };
  }
}