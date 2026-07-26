import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateLimitRecordEntity } from '../entities/rate-limit-record.entity';

export interface PerUserRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

const DEFAULT_LIMITS: Record<string, number> = {
  read: 100,
  write: 20,
};

@Injectable()
export class PerUserRateLimitService {
  private readonly logger = new Logger(PerUserRateLimitService.name);

  constructor(
    @InjectRepository(RateLimitRecordEntity)
    private readonly recordRepo: Repository<RateLimitRecordEntity>,
  ) {}

  async check(
    userId: string,
    endpoint: string,
    method: string,
  ): Promise<PerUserRateLimitResult> {
    const category = this.categorizeMethod(method);
    const limit = this.getLimitForEndpoint(endpoint, category);
    const windowMs = 60_000;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    let record = await this.recordRepo.findOne({
      where: { userId, endpoint },
    });

    if (!record) {
      record = this.recordRepo.create({
        userId,
        endpoint,
        requestCount: 1,
        windowStart: now,
      });
      await this.recordRepo.save(record);
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(now.getTime() + windowMs),
        limit,
      };
    }

    const windowExpired = record.windowStart.getTime() < windowStart.getTime();

    if (windowExpired) {
      record.requestCount = 1;
      record.windowStart = now;
      await this.recordRepo.save(record);
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(now.getTime() + windowMs),
        limit,
      };
    }

    const allowed = record.requestCount < limit;

    if (allowed) {
      await this.recordRepo.update(record.id, {
        requestCount: record.requestCount + 1,
      });
    }

    return {
      allowed,
      remaining: Math.max(0, limit - record.requestCount - (allowed ? 1 : 0)),
      resetAt: new Date(record.windowStart.getTime() + windowMs),
      limit,
    };
  }

  async getUsage(
    userId: string,
    endpoint: string,
  ): Promise<{ requestCount: number; limit: number; resetAt: Date }> {
    const record = await this.recordRepo.findOne({
      where: { userId, endpoint },
    });

    const limit = this.getLimitForEndpoint(endpoint, 'read');
    const windowMs = 60_000;

    if (!record) {
      return {
        requestCount: 0,
        limit,
        resetAt: new Date(Date.now() + windowMs),
      };
    }

    const windowExpired =
      record.windowStart.getTime() < Date.now() - windowMs;

    return {
      requestCount: windowExpired ? 0 : record.requestCount,
      limit,
      resetAt: new Date(record.windowStart.getTime() + windowMs),
    };
  }

  private categorizeMethod(method: string): 'read' | 'write' {
    if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
      return 'read';
    }
    return 'write';
  }

  private getLimitForEndpoint(endpoint: string, category: 'read' | 'write'): number {
    return DEFAULT_LIMITS[category];
  }
}
