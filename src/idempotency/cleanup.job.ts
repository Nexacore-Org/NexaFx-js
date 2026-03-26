import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyCleanupJob {
  private readonly logger = new Logger(IdempotencyCleanupJob.name);

  constructor(private readonly idempotencyService: IdempotencyService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredKeys(): Promise<void> {
    this.logger.log('Running idempotency key cleanup...');
    const deleted = await this.idempotencyService.cleanup();
    this.logger.log(`Cleaned up ${deleted} expired idempotency keys`);
  }
}
