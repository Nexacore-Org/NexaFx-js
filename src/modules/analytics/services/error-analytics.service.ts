import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class ErrorAnalyticsService {
  constructor(private readonly redis: Redis) {}

  async recordError(code: string) {
    const key = `errors:${new Date().toISOString().slice(0, 13)}`; // hourly bucket
    await this.redis.hincrby(key, code, 1);
    await this.redis.expire(key, 86400); // 24h
  }

  async getTopErrors() {
    const keys = await this.redis.keys('errors:*');

    const aggregate: Record<string, number> = {};

    for (const key of keys) {
      const data = await this.redis.hgetall(key);

      for (const code in data) {
        aggregate[code] =
          (aggregate[code] || 0) + parseInt(data[code], 10);
      }
    }

    return Object.entries(aggregate)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count }));
  }
}