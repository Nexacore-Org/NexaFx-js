import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class WebhooksListener {
  constructor(private readonly webhooksService: WebhooksService) {}

  @OnEvent('transactions.completed')
  async onTransactionCompleted(
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.webhooksService.dispatchEvent('transactions.completed', payload);
  }

  @OnEvent('transactions.reversed')
  async onTransactionReversed(payload: Record<string, unknown>): Promise<void> {
    await this.webhooksService.dispatchEvent('transactions.reversed', payload);
  }

  @OnEvent('kyc.reviewed')
  async onKycReviewed(payload: Record<string, unknown>): Promise<void> {
    await this.webhooksService.dispatchEvent('kyc.reviewed', payload);
  }

  @OnEvent('aml.alert.created')
  async onAmlAlertCreated(payload: Record<string, unknown>): Promise<void> {
    await this.webhooksService.dispatchEvent('aml.alert.created', payload);
  }
}
