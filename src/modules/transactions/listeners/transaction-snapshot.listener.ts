import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  TRANSACTION_COMPLETED,
  TRANSACTION_FAILED,
} from '../events';
import type {
  TransactionCompletedPayload,
  TransactionFailedPayload,
} from '../events';
import { TransactionSnapshotService } from '../services/transaction-snapshot.service';

/**
 * Creates execution snapshots when a transaction completes or fails.
 */
@Injectable()
export class TransactionSnapshotListener {
  private readonly logger = new Logger(TransactionSnapshotListener.name);

  constructor(private readonly snapshotService: TransactionSnapshotService) {}

  @OnEvent(TRANSACTION_COMPLETED)
  async onTransactionCompleted(payload: TransactionCompletedPayload) {
    await this.snapshotService.createSnapshot({
      transactionId: payload.transactionId,
      status: 'SUCCESS',
      durationMs: payload.durationMs,
      metadata: {
        completedAt: payload.completedAt?.toISOString(),
        ...payload.metadata,
      },
    });
    this.logger.debug(`Snapshot created for completed transaction ${payload.transactionId}`);
  }

  @OnEvent(TRANSACTION_FAILED)
  async onTransactionFailed(payload: TransactionFailedPayload) {
    await this.snapshotService.createSnapshot({
      transactionId: payload.transactionId,
      status: 'FAILED',
      metadata: {
        failedAt: payload.failedAt?.toISOString(),
        errorCode: payload.errorCode,
        retryable: payload.retryable,
        ...payload.meta,
      },
      errorMessage: payload.errorMessage,
    });
    this.logger.debug(`Snapshot created for failed transaction ${payload.transactionId}`);
  }
}
