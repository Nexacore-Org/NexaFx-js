import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TRANSACTION_COMPLETED } from '../../modules/transactions/events';
import type { TransactionCompletedPayload } from '../../modules/transactions/events';
import { AmlRulesService } from '../services/aml-rules.service';

/**
 * Listens for TRANSACTION_COMPLETED events and evaluates AML rules asynchronously.
 * AML evaluation runs AFTER the transaction commits — never before or during.
 */
@Injectable()
export class TransactionAmlListener {
  private readonly logger = new Logger(TransactionAmlListener.name);

  constructor(private readonly amlRulesService: AmlRulesService) {}

  @OnEvent(TRANSACTION_COMPLETED)
  async onTransactionCompleted(payload: TransactionCompletedPayload) {
    const userId = (payload.metadata as any)?.userId;
    if (!userId) return; // No user context — skip AML evaluation

    try {
      await this.amlRulesService.evaluate({
        transactionId: payload.transactionId,
        userId,
        amount: (payload.metadata as any)?.amount ?? 0,
        currency: (payload.metadata as any)?.currency ?? 'USD',
        toAddress: (payload.metadata as any)?.toAddress,
        fromAddress: (payload.metadata as any)?.fromAddress,
        createdAt: payload.completedAt ?? payload.timestamp,
      });
    } catch (err: any) {
      // AML evaluation must never crash the event pipeline
      this.logger.error(
        `AML evaluation failed for transaction ${payload.transactionId}: ${err?.message}`,
        err?.stack,
      );
    }
  }
}
