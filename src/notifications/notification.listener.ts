import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TransactionEvent,
  TransactionReversedEvent,
  TransactionSidedEvent,
  TransferCompletedEvent,
} from '../common/events/transaction-events';
import { TransactionTimedOutEvent } from '../common/events/transaction-timed-out.event';
import { NotificationBatchingService } from './notification-batching.service';
import { NotificationEventType } from '../notification-preferences/notification-preference.entity';

/**
 * Listens for the domain events that `TransactionsService` actually emits and
 * dispatches preference-aware push notifications via the batching service.
 *
 * The event names come from `TransactionEvent` (shared with the producer) so
 * emitter and listener cannot drift — the previous version listened for
 * `transaction.completed`, which nothing emitted, so no push notification ever
 * fired (#1448).
 */
@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(private readonly batchingService: NotificationBatchingService) {}

  /**
   * A peer transfer is single-sourced from `senderId`/`receiverId`. Both
   * parties are notified, each with copy written from their own perspective.
   */
  @OnEvent(TransactionEvent.COMPLETED)
  async handleTransferCompleted(event: TransferCompletedEvent): Promise<void> {
    const amount = `${event.amount} ${event.currency}`;
    this.logger.log(
      `[NotificationListener] ${TransactionEvent.COMPLETED} — ` +
        `txId=${event.transactionId} sender=${event.senderId} receiver=${event.receiverId} amount=${amount}`,
    );

    // A self-transfer (sender === receiver) should notify once, not twice.
    const recipients = new Set(
      [event.senderId, event.receiverId].filter(Boolean),
    );
    for (const userId of recipients) {
      const body =
        userId === event.senderId
          ? `You sent ${amount}.`
          : `You received ${amount}.`;

      await this.batchingService.dispatch(
        userId,
        NotificationEventType.TRANSACTION,
        {
          title: 'Transaction Completed',
          body,
          data: { transactionId: event.transactionId },
        },
      );
    }
  }

  @OnEvent(TransactionEvent.DEPOSIT_COMPLETED)
  async handleDepositCompleted(event: TransactionSidedEvent): Promise<void> {
    await this.dispatchSided(
      event,
      'Deposit Completed',
      'Your deposit has been completed.',
    );
  }

  @OnEvent(TransactionEvent.WITHDRAWAL_COMPLETED)
  async handleWithdrawalCompleted(event: TransactionSidedEvent): Promise<void> {
    await this.dispatchSided(
      event,
      'Withdrawal Completed',
      'Your withdrawal has been completed.',
    );
  }

  @OnEvent(TransactionEvent.SWAP_COMPLETED)
  async handleSwapCompleted(event: TransactionSidedEvent): Promise<void> {
    await this.dispatchSided(
      event,
      'Swap Completed',
      'Your swap has been completed.',
    );
  }

  @OnEvent(TransactionEvent.SWAP_FAILED)
  async handleSwapFailed(event: TransactionSidedEvent): Promise<void> {
    await this.dispatchSided(
      event,
      'Swap Failed',
      'Your swap could not be completed and has been refunded.',
    );
  }

  @OnEvent(TransactionEvent.REVERSED)
  async handleTransactionReversed(
    event: TransactionReversedEvent,
  ): Promise<void> {
    this.logger.log(
      `[NotificationListener] ${TransactionEvent.REVERSED} — ` +
        `txId=${event.transactionId} reason=${event.reason}`,
    );

    // Notify every affected party once. Older payloads only carried the
    // reversing actor, so absent parties simply mean nobody is notified
    // rather than a wrong recipient being notified.
    const recipients = new Set(
      [event.senderId, event.receiverId].filter((id): id is string =>
        Boolean(id),
      ),
    );
    for (const userId of recipients) {
      await this.batchingService.dispatch(
        userId,
        NotificationEventType.TRANSACTION,
        {
          title: 'Transaction Reversed',
          body: `A transaction involving you was reversed: ${event.reason}.`,
          data: { transactionId: event.transactionId },
        },
      );
    }
  }

  @OnEvent('transaction.timed_out')
  async handleTransactionTimedOut(
    event: TransactionTimedOutEvent,
  ): Promise<void> {
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

  private async dispatchSided(
    event: TransactionSidedEvent,
    title: string,
    body: string,
  ): Promise<void> {
    this.logger.log(
      `[NotificationListener] ${title} — txId=${event.transactionId} userId=${event.userId}`,
    );

    if (!event.userId) return;

    await this.batchingService.dispatch(
      event.userId,
      NotificationEventType.TRANSACTION,
      {
        title,
        body,
        data: { transactionId: event.transactionId },
      },
    );
  }
}
