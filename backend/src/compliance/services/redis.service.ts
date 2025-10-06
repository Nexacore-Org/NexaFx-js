import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'redis';

export interface LimitWindow {
  daily: number;
  weekly: number;
  monthly: number;
  transactionCount: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis.RedisClientType;
  private isConnected = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.client = Redis.createClient({
      url: redisUrl,
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Connected to Redis');
      this.isConnected = true;
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    return await this.client.get(key);
  }

  async delete(key: string): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    return await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const result = await this.client.exists(key);
    return result > 0;
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const count = await this.client.incr(key);

    if (ttlSeconds) {
      await this.client.expire(key, ttlSeconds);
    }

    return count;
  }

  async getOrSet(key: string, factory: () => Promise<string>, ttlSeconds?: number): Promise<string> {
    const existing = await this.get(key);

    if (existing) {
      return existing;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);

    return value;
  }

  // Transaction limit tracking methods
  async updateTransactionLimits(
    userId: string,
    amount: number,
    timestamp: Date = new Date()
  ): Promise<LimitWindow> {
    const date = timestamp.toISOString().split('T')[0];
    const weekStart = this.getWeekStart(timestamp);
    const monthStart = this.getMonthStart(timestamp);

    const keys = {
      dailyAmount: `limits:${userId}:daily:${date}:amount`,
      weeklyAmount: `limits:${userId}:weekly:${weekStart}:amount`,
      monthlyAmount: `limits:${userId}:monthly:${monthStart}:amount`,
      dailyCount: `limits:${userId}:daily:${date}:count`,
      weeklyCount: `limits:${userId}:weekly:${weekStart}:count`,
      monthlyCount: `limits:${userId}:monthly:${monthStart}:count`,
    };

    // Use Redis pipeline for atomic operations
    const pipeline = this.client.multi();

    pipeline.incrByFloat(keys.dailyAmount, amount);
    pipeline.incrByFloat(keys.weeklyAmount, amount);
    pipeline.incrByFloat(keys.monthlyAmount, amount);
    pipeline.incr(keys.dailyCount);
    pipeline.incr(keys.weeklyCount);
    pipeline.incr(keys.monthlyCount);

    // Set expiry for rolling windows
    const tomorrow = new Date(timestamp);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(timestamp);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date(timestamp.getFullYear(), timestamp.getMonth() + 1, 1);

    pipeline.expire(keys.dailyAmount, Math.floor((tomorrow.getTime() - timestamp.getTime()) / 1000));
    pipeline.expire(keys.weeklyAmount, Math.floor((nextWeek.getTime() - timestamp.getTime()) / 1000));
    pipeline.expire(keys.monthlyAmount, Math.floor((nextMonth.getTime() - timestamp.getTime()) / 1000));
    pipeline.expire(keys.dailyCount, Math.floor((tomorrow.getTime() - timestamp.getTime()) / 1000));
    pipeline.expire(keys.weeklyCount, Math.floor((nextWeek.getTime() - timestamp.getTime()) / 1000));
    pipeline.expire(keys.monthlyCount, Math.floor((nextMonth.getTime() - timestamp.getTime()) / 1000));

    await pipeline.exec();

    // Get current values
    const [
      dailyAmount,
      weeklyAmount,
      monthlyAmount,
      dailyCount,
      weeklyCount,
      monthlyCount,
    ] = await Promise.all([
      this.client.get(keys.dailyAmount),
      this.client.get(keys.weeklyAmount),
      this.client.get(keys.monthlyAmount),
      this.client.get(keys.dailyCount),
      this.client.get(keys.weeklyCount),
      this.client.get(keys.monthlyCount),
    ]);

    return {
      daily: parseFloat(dailyAmount || '0'),
      weekly: parseFloat(weeklyAmount || '0'),
      monthly: parseFloat(monthlyAmount || '0'),
      transactionCount: {
        daily: parseInt(dailyCount || '0'),
        weekly: parseInt(weeklyCount || '0'),
        monthly: parseInt(monthlyCount || '0'),
      },
    };
  }

  async getTransactionLimits(userId: string, timestamp: Date = new Date()): Promise<LimitWindow> {
    const date = timestamp.toISOString().split('T')[0];
    const weekStart = this.getWeekStart(timestamp);
    const monthStart = this.getMonthStart(timestamp);

    const keys = {
      dailyAmount: `limits:${userId}:daily:${date}:amount`,
      weeklyAmount: `limits:${userId}:weekly:${weekStart}:amount`,
      monthlyAmount: `limits:${userId}:monthly:${monthStart}:amount`,
      dailyCount: `limits:${userId}:daily:${date}:count`,
      weeklyCount: `limits:${userId}:weekly:${weekStart}:count`,
      monthlyCount: `limits:${userId}:monthly:${monthStart}:count`,
    };

    const [
      dailyAmount,
      weeklyAmount,
      monthlyAmount,
      dailyCount,
      weeklyCount,
      monthlyCount,
    ] = await Promise.all([
      this.client.get(keys.dailyAmount),
      this.client.get(keys.weeklyAmount),
      this.client.get(keys.monthlyAmount),
      this.client.get(keys.dailyCount),
      this.client.get(keys.weeklyCount),
      this.client.get(keys.monthlyCount),
    ]);

    return {
      daily: parseFloat(dailyAmount || '0'),
      weekly: parseFloat(weeklyAmount || '0'),
      monthly: parseFloat(monthlyAmount || '0'),
      transactionCount: {
        daily: parseInt(dailyCount || '0'),
        weekly: parseInt(weeklyCount || '0'),
        monthly: parseInt(monthlyCount || '0'),
      },
    };
  }

  // Velocity tracking methods
  async trackTransactionVelocity(
    userId: string,
    amount: number,
    recipientId: string,
    timestamp: Date = new Date()
  ): Promise<number> {
    const key = `velocity:${userId}:${recipientId}`;
    const windowKey = `velocity:${userId}:${recipientId}:${timestamp.toISOString().slice(0, 13)}`;

    // Track transaction in 1-hour windows
    await this.client.incr(windowKey);
    await this.client.expire(windowKey, 3600); // 1 hour

    // Get velocity score based on recent activity
    const recentKeys = await this.client.keys(`velocity:${userId}:${recipientId}:${timestamp.toISOString().slice(0, 10)}*`);
    const velocities = await Promise.all(recentKeys.map(k => this.client.get(k)));

    const totalTransactions = velocities.reduce((sum, v) => sum + (parseInt(v || '0')), 0);

    // Calculate velocity score (transactions per hour in last 24 hours)
    return totalTransactions / 24;
  }

  async getUserVelocityScore(userId: string, timestamp: Date = new Date()): Promise<number> {
    const pattern = `velocity:${userId}:*:${timestamp.toISOString().slice(0, 10)}*`;
    const keys = await this.client.keys(pattern);

    if (keys.length === 0) return 0;

    const velocities = await Promise.all(keys.map(k => this.client.get(k)));
    const totalTransactions = velocities.reduce((sum, v) => sum + (parseInt(v || '0')), 0);

    return totalTransactions / 24; // Average per hour over 24 hours
  }

  // Cache methods for compliance data
  async cacheSanctionsCheck(userId: string, result: any, ttlSeconds: number = 3600): Promise<void> {
    await this.set(`sanctions:${userId}`, JSON.stringify(result), ttlSeconds);
  }

  async getCachedSanctionsCheck(userId: string): Promise<any | null> {
    const cached = await this.get(`sanctions:${userId}`);
    return cached ? JSON.parse(cached) : null;
  }

  async cachePEPCheck(userId: string, result: any, ttlSeconds: number = 3600): Promise<void> {
    await this.set(`pep:${userId}`, JSON.stringify(result), ttlSeconds);
  }

  async getCachedPEPCheck(userId: string): Promise<any | null> {
    const cached = await this.get(`pep:${userId}`);
    return cached ? JSON.parse(cached) : null;
  }

  private getWeekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    const weekStart = new Date(d.setDate(diff));
    return weekStart.toISOString().split('T')[0];
  }

  private getMonthStart(date: Date): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
}
