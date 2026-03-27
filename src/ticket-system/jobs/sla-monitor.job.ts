import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupportService } from '../support.service';

/**
 * SlaMonitorJob runs every 10 minutes and escalates tickets
 * that have breached their SLA deadline by more than 30 minutes.
 * Escalation is idempotent — tickets already flagged are skipped.
 */
@Injectable()
export class SlaMonitorJob {
  private readonly logger = new Logger(SlaMonitorJob.name);

  constructor(private readonly supportService: SupportService) {}

  @Cron('*/10 * * * *') // every 10 minutes
  async checkSlaBreaches(): Promise<void> {
    try {
      const escalated = await this.supportService.escalateBreachedTickets();
      if (escalated > 0) {
        this.logger.warn(`SLA monitor: escalated ${escalated} tickets`);
      } else {
        this.logger.debug('SLA monitor: no new escalations');
      }
    } catch (err: any) {
      this.logger.error(`SLA monitor error: ${err.message}`, err.stack);
    }
  }
}
