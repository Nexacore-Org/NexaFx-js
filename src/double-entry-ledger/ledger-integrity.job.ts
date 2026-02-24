import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LedgerService } from './ledger.service';

@Injectable()
export class LedgerIntegrityJob {
  private readonly logger = new Logger(LedgerIntegrityJob.name);

  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * Runs every hour to validate ledger integrity.
   * Logs discrepancies for alerting pipelines to consume.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runIntegrityCheck(): Promise<void> {
    this.logger.log('Starting scheduled ledger integrity check...');

    try {
      const result = await this.ledgerService.runIntegrityValidation();

      if (result.failed.length > 0) {
        this.logger.error(
          `LEDGER INTEGRITY FAILURE — ${result.failed.length} discrepant transaction(s): ${result.failed.join(', ')}`,
        );
        // In production: emit to alerting system (PagerDuty, SNS, etc.)
      } else {
        this.logger.log(
          `Ledger integrity check passed — ${result.checked} transaction(s) verified`,
        );
      }
    } catch (err) {
      this.logger.error(`Integrity job failed unexpectedly: ${err.message}`, err.stack);
    }
  }

  /**
   * Daily full reconciliation run.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyReconciliation(): Promise<void> {
    this.logger.log('Starting daily full reconciliation...');

    try {
      const result = await this.ledgerService.reconcile({});

      if (!result.isBalanced) {
        this.logger.error(
          `RECONCILIATION FAILURE — discrepancy of ${result.discrepancy} detected across ${result.entriesChecked} entries`,
        );
      } else {
        this.logger.log(
          `Daily reconciliation passed — ${result.entriesChecked} entries, debits=${result.totalDebits}, credits=${result.totalCredits}`,
        );
      }
    } catch (err) {
      this.logger.error(`Reconciliation job failed: ${err.message}`, err.stack);
    }
  }
}
