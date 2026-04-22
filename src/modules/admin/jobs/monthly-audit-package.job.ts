import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditPackageService } from '../services/audit-package.service';

@Injectable()
export class MonthlyAuditPackageJob {
  private readonly logger = new Logger(MonthlyAuditPackageJob.name);

  constructor(private readonly auditPackageService: AuditPackageService) {}

  // Runs at 00:00 on the 1st of every month
  @Cron('0 0 1 * *')
  async runMonthlyAudit(): Promise<void> {
    this.logger.log('Scheduled monthly audit package generation started');
    await this.auditPackageService.generatePackage('scheduled');
  }
}
