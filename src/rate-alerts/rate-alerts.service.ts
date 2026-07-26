import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface RateAlert {
  id: string;
  userId: string;
  currencyPair: string;
  targetRate: number;
  direction: 'above' | 'below';
  triggered: boolean;
  createdAt: Date;
}

@Injectable()
export class RateAlertsService {
  private readonly logger = new Logger(RateAlertsService.name);
  private alerts: RateAlert[] = [];

  constructor(private readonly events: EventEmitter2) {}

  async create(userId: string, currencyPair: string, targetRate: number, direction: 'above' | 'below'): Promise<RateAlert> {
    const alert: RateAlert = {
      id: Math.random().toString(36).slice(2),
      userId, currencyPair, targetRate, direction,
      triggered: false, createdAt: new Date(),
    };
    this.alerts.push(alert);
    return alert;
  }

  async deactivate(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) alert.triggered = true;
  }

  checkThresholds(rates: Record<string, number>): void {
    for (const alert of this.alerts) {
      if (alert.triggered) continue;
      const currentRate = rates[alert.currencyPair];
      if (!currentRate) continue;

      const breached = alert.direction === 'above'
        ? currentRate >= alert.targetRate
        : currentRate <= alert.targetRate;

      if (breached) {
        alert.triggered = true;
        this.events.emit('rate-alert.triggered', { alertId: alert.id, userId: alert.userId, currencyPair: alert.currencyPair, rate: currentRate });
        this.logger.log(`Rate alert ${alert.id} triggered for ${alert.currencyPair} at ${currentRate}`);
      }
    }
  }
}
