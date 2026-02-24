import { Injectable, Logger } from "@nestjs/common";

export interface FailedLogin {
  userId: string;
  attempts: number;
  lastAttempt: Date;
  lockedUntil?: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private failedLogins: Map<string, FailedLogin> = new Map();
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 30;

  recordFailedLogin(userId: string) {
    const now = new Date();
    let entry = this.failedLogins.get(userId);
    if (!entry) {
      entry = { userId, attempts: 1, lastAttempt: now };
    } else {
      entry.attempts += 1;
      entry.lastAttempt = now;
    }
    if (entry.attempts >= this.MAX_ATTEMPTS) {
      entry.lockedUntil = new Date(now.getTime() + this.LOCKOUT_DURATION_MINUTES * 60000);
      this.logger.warn(`Account locked: ${userId}`);
    }
    this.failedLogins.set(userId, entry);
  }

  isAccountLocked(userId: string): boolean {
    const entry = this.failedLogins.get(userId);
    if (!entry || !entry.lockedUntil) return false;
    if (entry.lockedUntil > new Date()) return true;
    // Unlock after lockout duration
    entry.attempts = 0;
    entry.lockedUntil = undefined;
    this.failedLogins.set(userId, entry);
    this.logger.log(`Account unlocked: ${userId}`);
    return false;
  }

  resetFailedLogins(userId: string) {
    this.failedLogins.delete(userId);
  }
}
