import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RateAlertEvent, RateAlertTriggeredEvent } from '../rate-alert.events';
import { RateAlertHistoryService } from './rate-alert-history.service';

@Injectable()
export class RateAlertHistoryListener {
  private readonly logger = new Logger(RateAlertHistoryListener.name);

  constructor(private readonly historyService: RateAlertHistoryService) {}

  @OnEvent(RateAlertEvent.TRIGGERED)
  async onTriggered(event: RateAlertTriggeredEvent): Promise<void> {
    try {
      await this.historyService.recordAlert({
        alertId: event.alertId,
        userId: event.userId,
        currencyPair: event.currencyPair,
        triggeredRate: event.rate,
        targetRate: event.targetRate,
        direction: event.direction,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record history for rate alert ${event.alertId}: ${(error as Error).message}`,
      );
    }
  }
}
