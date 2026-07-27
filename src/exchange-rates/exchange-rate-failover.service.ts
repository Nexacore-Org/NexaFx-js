import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis.service';

@Injectable()
export class ExchangeRateFailoverService {
  private logger = new Logger(ExchangeRateFailoverService.name);
  private lastCachedRate: Record<string, any> = {};

  constructor(private redisService: RedisService) {}

  async getExchangeRate(pair: string) {
    try {
      const rate = await this.fetchFromPrimary(pair);
      await this.redisService.setex(`provider:1:healthy`, 300, 'true');
      this.lastCachedRate[pair] = rate;
      return { ...rate, stale: false };
    } catch (error) {
      this.logger.warn(`Primary provider failed, trying secondary for ${pair}`);
      try {
        const rate = await this.fetchFromSecondary(pair);
        this.lastCachedRate[pair] = rate;
        return { ...rate, stale: false };
      } catch (fallbackError) {
        this.logger.warn(`Secondary provider failed, using cached rate for ${pair}`);
        if (this.lastCachedRate[pair]) {
          return { ...this.lastCachedRate[pair], stale: true, staleAgeSeconds: 3600 };
        }
        throw new Error('All providers failed and no cache available');
      }
    }
  }

  private async fetchFromPrimary(pair: string) {
    return { pair, rate: 1.23 };
  }

  private async fetchFromSecondary(pair: string) {
    return { pair, rate: 1.24 };
  }
}
