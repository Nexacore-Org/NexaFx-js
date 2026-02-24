import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  TRANSACTION_CREATED,
  TRANSACTION_PROCESSING,
  TRANSACTION_COMPLETED,
  TRANSACTION_FAILED,
} from '../../transactions/events';
import type {
  TransactionCreatedPayload,
  TransactionProcessingPayload,
  TransactionCompletedPayload,
  TransactionFailedPayload,
} from '../../transactions/events';
import { WebhookDispatcherService } from '../webhook-dispatcher.service';

/**
 * Dispatches webhooks for transaction domain events.
 * Subscribers receive events: transaction.created, transaction.processing,
 * transaction.completed, transaction.failed.
 */
@Injectable()
export class TransactionWebhookListener {
  private readonly logger = new Logger(TransactionWebhookListener.name);

  constructor(private readonly webhookDispatcher: WebhookDispatcherService) {}

  @OnEvent(TRANSACTION_CREATED)
  async onTransactionCreated(payload: TransactionCreatedPayload) {
    await this.webhookDispatcher.dispatch(TRANSACTION_CREATED, payload);
    this.logger.debug(`Webhook dispatched for transaction.created ${payload.transactionId}`);
  }

  @OnEvent(TRANSACTION_PROCESSING)
  async onTransactionProcessing(payload: TransactionProcessingPayload) {
    await this.webhookDispatcher.dispatch(TRANSACTION_PROCESSING, payload);
    this.logger.debug(`Webhook dispatched for transaction.processing ${payload.transactionId}`);
  }

  @OnEvent(TRANSACTION_COMPLETED)
  async onTransactionCompleted(payload: TransactionCompletedPayload) {
    await this.webhookDispatcher.dispatch(TRANSACTION_COMPLETED, payload);
    this.logger.debug(`Webhook dispatched for transaction.completed ${payload.transactionId}`);
  }

  @OnEvent(TRANSACTION_FAILED)
  async onTransactionFailed(payload: TransactionFailedPayload) {
    await this.webhookDispatcher.dispatch(TRANSACTION_FAILED, payload);
    this.logger.debug(`Webhook dispatched for transaction.failed ${payload.transactionId}`);
  }
}
