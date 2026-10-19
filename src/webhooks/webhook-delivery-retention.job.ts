import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhooksService } from './webhooks.service';

/**
 * Prunes old webhook delivery rows (#1446).
 *
 * `webhook_deliveries` stores each request body and had no retention, so the
 * table (and the paginated history query) grew without bound. Retention is
 * controlled by `WEBHOOK_DELIVERY_RETENTION_DAYS`; leaving it unset disables
 * pruning rather than deleting anything unexpectedly.
 */
@Injectable()
export class WebhookDeliveryRetentionJob {
  private readonly logger = new Logger(WebhookDeliveryRetentionJob.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runRetentionSweep(): Promise<void> {
    const retentionDays = Number(
      process.env.WEBHOOK_DELIVERY_RETENTION_DAYS ?? '30',
    );

    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      this.logger.log(
        'Webhook delivery retention disabled (WEBHOOK_DELIVERY_RETENTION_DAYS <= 0); skipping sweep',
      );
      return;
    }

    const deleted =
      await this.webhooksService.pruneExpiredDeliveries(retentionDays);
    this.logger.log(
      `Webhook delivery retention sweep: deleted ${deleted} delivery row(s) older than ${retentionDays} day(s)`,
    );
  }
}
