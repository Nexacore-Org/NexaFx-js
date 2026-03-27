import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  TRANSACTION_CREATED,
  TRANSACTION_PROCESSING,
  TRANSACTION_COMPLETED,
  TRANSACTION_FAILED,
} from '../events';
import type {
  TransactionCreatedPayload,
  TransactionProcessingPayload,
  TransactionCompletedPayload,
  TransactionFailedPayload,
} from '../events';
import { NotificationsGateway } from '../../../web-sockets/notifications.gateway';
import { NOTIFICATION_EVENTS } from '../../../web-sockets/notifications.constants';

/**
 * Broadcasts transaction lifecycle events to the corresponding
 * transaction:{id} WebSocket room after the DB commit.
 */
@Injectable()
export class TransactionWebsocketListener {
  private readonly logger = new Logger(TransactionWebsocketListener.name);

  constructor(private readonly gateway: NotificationsGateway) {}

  @OnEvent(TRANSACTION_CREATED)
  onCreated(payload: TransactionCreatedPayload): void {
    this.gateway.emitToTransactionRoom(payload.transactionId, NOTIFICATION_EVENTS.TRANSACTION_CREATED, {
      transactionId: payload.transactionId,
      amount: payload.amount,
      currency: payload.currency,
      timestamp: payload.timestamp,
    });
    this.logger.debug(`WS broadcast: transaction.created for ${payload.transactionId}`);
  }

  @OnEvent(TRANSACTION_PROCESSING)
  onProcessing(payload: TransactionProcessingPayload): void {
    this.gateway.emitToTransactionRoom(payload.transactionId, NOTIFICATION_EVENTS.TRANSACTION_PENDING, {
      transactionId: payload.transactionId,
      startedAt: payload.startedAt,
      timestamp: payload.timestamp,
    });
    this.logger.debug(`WS broadcast: transaction.pending for ${payload.transactionId}`);
  }

  @OnEvent(TRANSACTION_COMPLETED)
  onCompleted(payload: TransactionCompletedPayload): void {
    this.gateway.emitToTransactionRoom(payload.transactionId, NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED, {
      transactionId: payload.transactionId,
      completedAt: payload.completedAt,
      durationMs: payload.durationMs,
      timestamp: payload.timestamp,
    });
    this.logger.debug(`WS broadcast: transaction.confirmed for ${payload.transactionId}`);
  }

  @OnEvent(TRANSACTION_FAILED)
  onFailed(payload: TransactionFailedPayload): void {
    this.gateway.emitToTransactionRoom(payload.transactionId, NOTIFICATION_EVENTS.TRANSACTION_FAILED, {
      transactionId: payload.transactionId,
      errorMessage: payload.errorMessage,
      errorCode: payload.errorCode,
      retryable: payload.retryable,
      failedAt: payload.failedAt,
      timestamp: payload.timestamp,
    });
    this.logger.debug(`WS broadcast: transaction.failed for ${payload.transactionId}`);
  }
}
