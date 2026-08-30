import { Injectable, Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class WebhookRetryJob {
  private readonly logger = new Logger(WebhookRetryJob.name);
  constructor(private readonly webhooksService: WebhooksService) {}

  async runRetrySweep() {
    this.logger.log('Running webhook cron-based retry sweep...');
    // Real recovery sweep for failed webhook delivery payloads
    await this.webhooksService.recoverFailedDeliveries();
  }
}
