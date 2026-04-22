import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** In-memory exposure tracker per currency pair. Replace with Redis for multi-instance. */
@Injectable()
export class FxExposureService {
  private readonly logger = new Logger(FxExposureService.name);
  private readonly exposure = new Map<string, number>();
  private readonly riskThreshold: number;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {
    this.riskThreshold = Number(config.get('FORWARD_RISK_THRESHOLD') ?? '1000000');
  }

  private key(base: string, quote: string): string {
    return `${base}/${quote}`;
  }

  async addExposure(base: string, quote: string, amount: number): Promise<void> {
    const k = this.key(base, quote);
    const current = this.exposure.get(k) ?? 0;
    const updated = current + amount;
    this.exposure.set(k, updated);

    if (updated > this.riskThreshold) {
      this.logger.warn(`Risk threshold exceeded for ${k}: ${updated}`);
      this.events.emit('fx.exposure.threshold_exceeded', { pair: k, exposure: updated, threshold: this.riskThreshold });
    }
  }

  async removeExposure(base: string, quote: string, amount: number): Promise<void> {
    const k = this.key(base, quote);
    const current = this.exposure.get(k) ?? 0;
    this.exposure.set(k, Math.max(0, current - amount));
  }

  getExposure(base: string, quote: string): number {
    return this.exposure.get(this.key(base, quote)) ?? 0;
  }

  getAllExposures(): Record<string, number> {
    return Object.fromEntries(this.exposure.entries());
  }
}
