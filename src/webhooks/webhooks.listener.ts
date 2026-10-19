import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebhooksService } from './webhooks.service';
import { CustomerWebhookEvent } from './webhook-events';

/**
 * Forwards customer-facing domain events to subscribed endpoints (#1444).
 *
 * Every handler derives the set of owners that are party to the event and
 * passes it to `dispatchEvent`, so a delivery is only ever created for
 * endpoints belonging to those users. Compliance-only events
 * (`aml.alert.created`, `kyc.reviewed`) are deliberately *not* forwarded to
 * customer webhooks: doing so previously leaked every flagged customer's data
 * and broke AML tipping-off rules.
 */
@Injectable()
export class WebhooksListener {
  private readonly logger = new Logger(WebhooksListener.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @OnEvent('transactions.completed')
  async onTransactionCompleted(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const ownerIds = [payload.senderId, payload.receiverId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    await this.forward('transactions.completed', ownerIds, payload);
  }

  @OnEvent('transactions.deposit.completed')
  async onDepositCompleted(payload: Record<string, unknown>): Promise<void> {
    await this.forwardSided('transactions.deposit.completed', payload);
  }

  @OnEvent('transactions.withdrawal.completed')
  async onWithdrawalCompleted(payload: Record<string, unknown>): Promise<void> {
    await this.forwardSided('transactions.withdrawal.completed', payload);
  }

  @OnEvent('transactions.swap.completed')
  async onSwapCompleted(payload: Record<string, unknown>): Promise<void> {
    await this.forwardSided('transactions.swap.completed', payload);
  }

  @OnEvent('transactions.swap.failed')
  async onSwapFailed(payload: Record<string, unknown>): Promise<void> {
    await this.forwardSided('transactions.swap.failed', payload);
  }

  @OnEvent('transactions.reversed')
  async onTransactionReversed(payload: Record<string, unknown>): Promise<void> {
    const ownerIds = [payload.senderId, payload.receiverId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    await this.forward('transactions.reversed', ownerIds, payload);
  }

  /** Single-sided events carry the affected user as `userId`. */
  private async forwardSided(
    eventName: CustomerWebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const userId = payload.userId;
    const ownerIds =
      typeof userId === 'string' && userId.length > 0 ? [userId] : [];
    await this.forward(eventName, ownerIds, payload);
  }

  private async forward(
    eventName: CustomerWebhookEvent,
    ownerIds: string[],
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (ownerIds.length === 0) {
      this.logger.warn(
        `Skipping ${eventName} webhook dispatch: no owner could be derived from the payload`,
      );
      return;
    }
    await this.webhooksService.dispatchEvent(eventName, ownerIds, payload);
  }
}
