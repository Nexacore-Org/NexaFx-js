import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataArchiveService } from '../services/data-archive.service';

@Injectable()
export class DataArchiveWorker {
  private readonly logger = new Logger(DataArchiveWorker.name);

  constructor(private readonly dataArchiveService: DataArchiveService) {}

  @Cron(process.env.ARCHIVE_CRON || '0 3 * * *')
  async archiveOldData() {
    if (!this.dataArchiveService.isArchiveEnabled()) {
      this.logger.debug('Data archival job skipped because ARCHIVE_ENABLED=false');
      return;
    }

    this.logger.log('Starting scheduled data archival job');

    try {
      const result = await this.dataArchiveService.runArchivalJob();
      this.logger.log(
        `Data archival complete (cutoff=${result.cutoffDate}) - ` +
          `transactions=${result.archivedTransactions}, ` +
          `snapshots=${result.archivedTransactionSnapshots}, ` +
          `risks=${result.archivedTransactionRisks}, ` +
          `apiUsageLogs=${result.archivedApiUsageLogs}`,
      );
    } catch (error) {
      this.logger.error('Data archival job failed', error);
    }
  }
}
