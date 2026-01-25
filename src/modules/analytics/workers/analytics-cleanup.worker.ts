import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiUsageService } from '../services/api-usage.service';

@Injectable()
export class AnalyticsCleanupWorker {
  private readonly logger = new Logger(AnalyticsCleanupWorker.name);

  constructor(private readonly apiUsageService: ApiUsageService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldLogs(): Promise<void> {
    this.logger.log('Starting API usage logs cleanup...');

    try {
      const retentionDays = 30; // Keep logs for 30 days
      const deletedCount =
        await this.apiUsageService.cleanupOldLogs(retentionDays);
      this.logger.log(
        `Successfully cleaned up ${deletedCount} API usage logs older than ${retentionDays} days`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup API usage logs', error);
    }
  }
}
