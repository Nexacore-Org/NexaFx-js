import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RateAlertEntity } from './rate-alert.entity';

export type RateAlert = RateAlertEntity;

@Injectable()
export class RateAlertsService {
  private readonly logger = new Logger(RateAlertsService.name);

  constructor(
    @InjectRepository(RateAlertEntity)
    private readonly alertsRepo: Repository<RateAlertEntity>,
    private readonly events: EventEmitter2,
  ) {}

  async create(userId: string, currencyPair: string, targetRate: number, direction: 'above' | 'below'): Promise<RateAlert> {
    const alert = this.alertsRepo.create({ userId, currencyPair, targetRate, direction, triggered: false });
    return this.alertsRepo.save(alert);
  }

  async deactivate(alertId: string): Promise<void> {
    await this.alertsRepo.update({ id: alertId }, { triggered: true });
  }

  async checkThresholds(rates: Record<string, number>): Promise<void> {
    const activeAlerts = await this.alertsRepo.find({ where: { triggered: false } });

    for (const alert of activeAlerts) {
      const currentRate = rates[alert.currencyPair];
      if (!currentRate) continue;

      const breached = alert.direction === 'above'
        ? currentRate >= alert.targetRate
        : currentRate <= alert.targetRate;

      if (breached) {
        await this.alertsRepo.update({ id: alert.id }, { triggered: true });
        this.events.emit('rate-alert.triggered', { alertId: alert.id, userId: alert.userId, currencyPair: alert.currencyPair, rate: currentRate });
        this.logger.log(`Rate alert ${alert.id} triggered for ${alert.currencyPair} at ${currentRate}`);
      }
    }
  }
}
