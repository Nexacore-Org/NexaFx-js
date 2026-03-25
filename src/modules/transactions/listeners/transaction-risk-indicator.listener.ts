import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TRANSACTION_CREATED, TransactionCreatedPayload } from '../events';
import { RiskIndicatorsService } from '../../risk/services/risk-indicators.service';

/**
 * Listens for transaction creation and triggers risk indicator evaluation
 * asynchronously to avoid blocking the user response.
 */
@Injectable()
export class TransactionRiskIndicatorListener {
  private readonly logger = new Logger(TransactionRiskIndicatorListener.name);

  constructor(private readonly riskIndicators: RiskIndicatorsService) {}

  @OnEvent(TRANSACTION_CREATED, { async: true })
  async handleTransactionCreated(payload: TransactionCreatedPayload) {
    // Run asynchronously, log but never throw
    try {
      await this.riskIndicators.evaluateTransaction(payload.transactionId);
      this.logger.debug(`Risk indicators evaluated for ${payload.transactionId}`);
    } catch (err) {
      this.logger.error(`Risk evaluation failed for ${payload.transactionId}: ${err.message}`);
    }
  }
}
