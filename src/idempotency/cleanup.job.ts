import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyCleanupJob {
  private readonly logger = new Logger(IdempotencyCleanupJob.name);

  constructor(
    private readonly idempotencyService: IdempotencyService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(process.env.IDEMPOTENCY_CLEANUP_CRON || '0 0 * * *')
  async cleanupExpiredKeys(): Promise<void> {
    this.logger.log('Running idempotency key cleanup...');
    const deleted = await this.idempotencyService.cleanup();
    this.logger.log(`Cleaned up ${deleted} expired idempotency keys`);
  }
}
