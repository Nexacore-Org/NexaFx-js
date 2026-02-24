import { Injectable, Logger } from "@nestjs/common";

export interface TransactionLimit {
  userId: string;
  hourlyCount: number;
  dailyCount: number;
  lastHour: Date;
  lastDay: Date;
}

@Injectable()
export class TransactionLimitService {
  private readonly logger = new Logger(TransactionLimitService.name);
  private limits: Map<string, TransactionLimit> = new Map();
  private readonly HOURLY_LIMIT = 10;
  private readonly DAILY_LIMIT = 100;

  recordTransaction(userId: string) {
    const now = new Date();
    let entry = this.limits.get(userId);
    if (!entry) {
      entry = { userId, hourlyCount: 1, dailyCount: 1, lastHour: now, lastDay: now };
    } else {
      // Reset hourly count if new hour
      if (now.getHours() !== entry.lastHour.getHours() || now.getDate() !== entry.lastHour.getDate()) {
        entry.hourlyCount = 1;
        entry.lastHour = now;
      } else {
        entry.hourlyCount += 1;
      }
      // Reset daily count if new day
      if (now.getDate() !== entry.lastDay.getDate() || now.getMonth() !== entry.lastDay.getMonth()) {
        entry.dailyCount = 1;
        entry.lastDay = now;
      } else {
        entry.dailyCount += 1;
      }
    }
    this.limits.set(userId, entry);
  }

  isRateLimited(userId: string): boolean {
    const entry = this.limits.get(userId);
    if (!entry) return false;
    if (entry.hourlyCount > this.HOURLY_LIMIT || entry.dailyCount > this.DAILY_LIMIT) {
      this.logger.warn(`Rate limit exceeded for user: ${userId}`);
      return true;
    }
    return false;
  }
}
