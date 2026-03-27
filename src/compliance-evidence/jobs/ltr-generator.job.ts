import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RegulatoryReportingService } from '../services/regulatory-reporting.service';
import { DataSource, MoreThan } from 'typeorm';

@Injectable()
export class LtrGeneratorJob {
  private readonly logger = new Logger(LtrGeneratorJob.name);

  constructor(
    private reportingService: RegulatoryReportingService,
    private dataSource: DataSource,
  ) {}

  @Cron('*/5 * * * *') // Run every 5 minutes
  async scanForLargeTransactions() {
    this.logger.log('Scanning for transactions exceeding LTR threshold...');
    
    const threshold = this.reportingService.getThreshold();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Fetch transactions above threshold within the last window
    const largeTxs = await this.dataSource.query(
      `SELECT * FROM transactions WHERE amount >= $1 AND "createdAt" >= $2`,
      [threshold, fiveMinutesAgo]
    );

    for (const tx of largeTxs) {
      try {
        await this.reportingService.generateReport(ReportType.LTR, tx);
      } catch (err) {
        this.logger.error(`Failed to generate LTR for TX ${tx.id}`, err.stack);
      }
    }
  }
}