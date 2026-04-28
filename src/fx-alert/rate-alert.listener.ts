import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FxAlertService } from '../services/fx-alert.service';
import { RateFetchedEvent } from '../events/rate-fetched.event';

/**
 * RateAlertListener
 *
 * Listens for 'fx.rate.fetched' events that are emitted after every
 * rate-fetch/broadcast cycle.  Alert evaluation runs here — fully decoupled
 * from the fetch path so it adds zero latency to rate broadcasting.
 *
 * The existing FX service/scheduler should emit RateFetchedEvent like so:
 *
 *   this.eventEmitter.emit('fx.rate.fetched', new RateFetchedEvent('USD/NGN', 1620.5));
 *
 * This listener then evaluates all active alerts for that pair.
 */
@Injectable()
export class RateAlertListener {
  private readonly logger = new Logger(RateAlertListener.name);

  constructor(private readonly fxAlertService: FxAlertService) {}

  @OnEvent('fx.rate.fetched', { async: true })
  async handleRateFetched(event: RateFetchedEvent): Promise<void> {
    try {
      await this.fxAlertService.evaluateAlertsForPair(event);
    } catch (err) {
      // Never let alert evaluation crash the event loop
      this.logger.error(
        `Alert evaluation failed for pair ${event.pair}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}

/**
 * AlertTriggeredListener
 *
 * Handles the actual notification dispatch once an alert fires.
 * Extend each channel handler to call your real email/push providers.
 */
@Injectable()
export class AlertTriggeredListener {
  private readonly logger = new Logger(AlertTriggeredListener.name);

  @OnEvent('fx.alert.triggered', { async: true })
  async handleAlertTriggered(payload: {
    alertId: string;
    userId: string;
    pair: string;
    direction: string;
    threshold: number;
    triggerRate: number;
    channels: string[];
  }): Promise<void> {
    const { alertId, userId, pair, direction, threshold, triggerRate, channels } = payload;

    this.logger.log(
      `Dispatching notifications for alert ${alertId} — user ${userId}, ${pair} ${direction} ${threshold} (hit at ${triggerRate})`,
    );

    const promises: Promise<void>[] = [];

    if (channels.includes('IN_APP')) {
      promises.push(this.sendInApp(userId, pair, direction, threshold, triggerRate));
    }
    if (channels.includes('EMAIL')) {
      promises.push(this.sendEmail(userId, pair, direction, threshold, triggerRate));
    }
    if (channels.includes('PUSH')) {
      promises.push(this.sendPush(userId, pair, direction, threshold, triggerRate));
    }

    // All channels fire in parallel; individual failures are swallowed so one
    // bad channel doesn't prevent others from delivering.
    const results = await Promise.allSettled(promises);
    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) =>
        this.logger.error(`Notification delivery failed: ${(r as PromiseRejectedResult).reason}`),
      );
  }

  // ── Channel handlers ─────────────────────────────────────────────────────
  // Replace the log statements with real integrations (SSE, Nodemailer, FCM…)

  private async sendInApp(
    userId: string,
    pair: string,
    direction: string,
    threshold: number,
    triggerRate: number,
  ): Promise<void> {
    this.logger.log(
      `[IN_APP] → userId=${userId}: ${pair} ${direction} ${threshold} triggered at ${triggerRate}`,
    );
    // TODO: push to WebSocket/SSE gateway
  }

  private async sendEmail(
    userId: string,
    pair: string,
    direction: string,
    threshold: number,
    triggerRate: number,
  ): Promise<void> {
    this.logger.log(
      `[EMAIL] → userId=${userId}: ${pair} ${direction} ${threshold} triggered at ${triggerRate}`,
    );
    // TODO: call MailerService / SES
  }

  private async sendPush(
    userId: string,
    pair: string,
    direction: string,
    threshold: number,
    triggerRate: number,
  ): Promise<void> {
    this.logger.log(
      `[PUSH] → userId=${userId}: ${pair} ${direction} ${threshold} triggered at ${triggerRate}`,
    );
    // TODO: call FCM / APNs
  }
}
