import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TransactionCompletedEvent } from '../common/events/transaction-completed.event';
import { TransactionTimedOutEvent } from '../common/events/transaction-timed-out.event';
import { NotificationBatchingService } from './notification-batching.service';
import { NotificationEventType } from '../notification-preferences/notification-preference.entity';

/**
 * Listens for domain events and dispatches notifications via the batching service.
 */
@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(private readonly batchingService: NotificationBatchingService) {}

  @OnEvent('transaction.completed')
  async handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] transaction.completed — ` +
      `txId=${event.transactionId} userId=${event.userId} ` +
      `amount=${event.amount} ${event.currency}`,
    );

    await this.batchingService.dispatch(
      event.userId,
      NotificationEventType.TRANSACTION,
      {
        title: 'Transaction Completed',
        body: `Your ${event.amount} ${event.currency} transaction has been completed.`,
        data: { transactionId: event.transactionId },
      },
    );
  }

  @OnEvent('transaction.timed_out')
  async handleTransactionTimedOut(event: TransactionTimedOutEvent): Promise<void> {
    this.logger.log(
      `[NotificationListener] transaction.timed_out — ` +
      `txId=${event.transactionId} userId=${event.userId} refunded=${event.refunded}`,
    );

    await this.batchingService.dispatch(
      event.userId,
      NotificationEventType.TRANSACTION,
      {
        title: 'Transaction Timed Out',
        body: event.refunded
          ? `Your ${event.amount} ${event.currency} transaction timed out and has been refunded.`
          : `Your ${event.amount} ${event.currency} transaction timed out.`,
        data: { transactionId: event.transactionId },
      },
    );
  }
}
