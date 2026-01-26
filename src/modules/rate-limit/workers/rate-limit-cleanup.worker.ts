import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RateLimitService } from '../services/rate-limit.service';

@Injectable()
export class RateLimitCleanupWorker {
  private readonly logger = new Logger(RateLimitCleanupWorker.name);

  constructor(private readonly rateLimitService: RateLimitService) {}

  /**
   * Clean up expired rate limit trackers every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    this.logger.log('Starting rate limit tracker cleanup...');

    try {
      const deletedCount = await this.rateLimitService.cleanupExpiredTrackers();
      this.logger.log(`Cleaned up ${deletedCount} expired rate limit trackers`);
    } catch (error) {
      this.logger.error('Error during rate limit tracker cleanup:', error);
    }
  }
}
