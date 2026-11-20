import { Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ClusterCron } from '../common/locks/cluster-cron.decorator';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class WebhookRetryJob {
  private readonly logger = new Logger(WebhookRetryJob.name);
  constructor(private readonly webhooksService: WebhooksService) {}

  @ClusterCron(CronExpression.EVERY_MINUTE, 'webhooks:retry-sweep')
  async runRetrySweep(): Promise<void> {
    this.logger.log('Running webhook cron-based retry sweep...');
    await this.webhooksService.recoverFailedDeliveries();
    const requeued = await this.webhooksService.recoverStuckPendingDeliveries();
    if (requeued > 0) {
      this.logger.warn(
        `Re-enqueued ${requeued} stranded PENDING webhook delivery(ies)`,
      );
    }
  }

  /** Backs the manual "retry delivery" endpoint (#1588). */
  async manualRetry(deliveryId: string, ownerId: string) {
    return this.webhooksService.retryDeliveryForOwner(deliveryId, ownerId);
  }
}
