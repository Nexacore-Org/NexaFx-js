import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WebhookDispatcherService } from '../webhook-dispatcher.service';
import {
  getWebhookEventCatalogEntry,
  WEBHOOK_EVENT_CATALOG,
} from '../webhook-event-catalog';

@Injectable()
export class WebhookSandboxService {
  private readonly logger = new Logger(WebhookSandboxService.name);

  constructor(private readonly webhookDispatcher: WebhookDispatcherService) {}

  async sendTestEvent(eventType: string) {
    const event = getWebhookEventCatalogEntry(eventType);
    if (!event) {
      throw new NotFoundException(
        `Unknown webhook event type "${eventType}". Supported events: ${WEBHOOK_EVENT_CATALOG.map((entry) => entry.eventName).join(', ')}`,
      );
    }

    const payload = {
      ...event.samplePayload,
      sandbox: true,
      generatedAt: new Date().toISOString(),
    };

    const result = await this.webhookDispatcher.dispatch(event.eventName, payload);
    this.logger.log(`Sandbox webhook dispatched for ${eventType} to ${result.sentTo} subscriptions`);

    return {
      success: true,
      eventType: event.eventName,
      sentTo: result.sentTo,
      payload,
    };
  }
}
