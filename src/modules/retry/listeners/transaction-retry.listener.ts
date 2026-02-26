import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { TRANSACTION_FAILED } from '../../transactions/events';
import type { TransactionFailedPayload } from '../../transactions/events';
import { RetryService } from '../retry.services';
import type { RetryErrorCategory } from '../entities/retry-job.entity';

/**
 * Schedules retry jobs when a transaction fails and is marked retryable.
 */
@Injectable()
export class TransactionRetryListener {
  private readonly logger = new Logger(TransactionRetryListener.name);

  constructor(private readonly retryService: RetryService) {}

  @OnEvent(TRANSACTION_FAILED)
  async onTransactionFailed(payload: TransactionFailedPayload) {
    if (payload.retryable !== true) return;

    const errorCategory = this.mapToErrorCategory(payload.errorCode);

    await this.retryService.createJob({
      type: 'transfer.retry',
      entityId: payload.transactionId,
      errorCategory,
      errorMessage: payload.errorMessage,
      meta: payload.meta ?? { failedAt: payload.failedAt?.toISOString() },
    });

    this.logger.log(
      `Retry job scheduled for transaction ${payload.transactionId} (${errorCategory})`,
    );
  }

  private mapToErrorCategory(code?: string): RetryErrorCategory {
    if (!code) return 'UNKNOWN';
    const map: Record<string, RetryErrorCategory> = {
      NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
      RATE_LIMIT: 'PROVIDER_RATE_LIMIT',
      TEMPORARY: 'PROVIDER_TEMPORARY_FAILURE',
      INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
      INVALID_RECIPIENT: 'INVALID_RECIPIENT',
      DUPLICATE: 'DUPLICATE_REQUEST',
    };
    return map[code] ?? 'UNKNOWN';
  }
}
