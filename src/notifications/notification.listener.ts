import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransactionCompletedEvent } from '../common/events/transaction-completed.event';

/**
 * Listens for domain events and dispatches in-app notifications.
 */
@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  @OnEvent('transaction.completed')
  handleTransactionCompleted(event: TransactionCompletedEvent): void {
    this.logger.log(
      `[NotificationListener] transaction.completed — ` +
      `txId=${event.transactionId} userId=${event.userId} ` +
      `amount=${event.amount} ${event.currency}`,
    );
    // In a full implementation: persist a Notification entity and dispatch push/email
  }
}
