import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull, Or } from 'typeorm';
import { FxAlert } from '../entities/fx-alert.entity';
import { FxAlertHistory } from '../entities/fx-alert-history.entity';
import { FxTargetOrder, TargetOrderStatus } from '../entities/fx-target-order.entity';

export interface CreateAlertDto {
  currencyPair: string;
  threshold: number;
  direction: 'above' | 'below';
  expiresAt: Date;
  isRecurring?: boolean;
  maxTriggers?: number;
}

export interface CreateTargetOrderDto {
  currencyPair: string;
  targetRate: number;
  amount: number;
  direction: 'above' | 'below';
  expiresAt?: Date;
  idempotencyKey: string;
}

@Injectable()
export class FxAlertService {
  constructor(
    @InjectRepository(FxAlert)
    private readonly alertRepo: Repository<FxAlert>,
    @InjectRepository(FxAlertHistory)
    private readonly historyRepo: Repository<FxAlertHistory>,
    @InjectRepository(FxTargetOrder)
    private readonly targetOrderRepo: Repository<FxTargetOrder>,
  ) {}

  async createAlert(userId: string, dto: CreateAlertDto): Promise<FxAlert> {
    const alert = this.alertRepo.create({ userId, ...dto, isActive: true, triggerCount: 0 });
    return this.alertRepo.save(alert);
  }

  async listAlerts(userId: string): Promise<FxAlert[]> {
    return this.alertRepo.find({
      where: { userId, isActive: true, expiresAt: MoreThan(new Date()) },
    });
  }

  async getAlertHistory(userId: string): Promise<FxAlertHistory[]> {
    return this.historyRepo.find({ where: { userId }, order: { triggerTime: 'DESC' } });
  }

  async createTargetOrder(userId: string, dto: CreateTargetOrderDto): Promise<FxTargetOrder> {
    // Idempotency: return existing if same key
    const existing = await this.targetOrderRepo.findOne({
      where: { idempotencyKey: dto.idempotencyKey, userId },
    });
    if (existing) return existing;

    const order = this.targetOrderRepo.create({ userId, ...dto, status: TargetOrderStatus.PENDING });
    return this.targetOrderRepo.save(order);
  }

  async listTargetOrders(userId: string): Promise<FxTargetOrder[]> {
    return this.targetOrderRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Called by a rate-check job with current rates.
   * Handles recurring re-arm and target order execution.
   */
  async evaluateAlerts(currentRates: Record<string, number>): Promise<void> {
    const now = new Date();

    // Evaluate alerts
    const alerts = await this.alertRepo.find({
      where: { isActive: true, expiresAt: MoreThan(now) },
    });

    for (const alert of alerts) {
      const rate = currentRates[alert.currencyPair];
      if (rate == null) continue;

      const triggered =
        (alert.direction === 'above' && rate > Number(alert.threshold)) ||
        (alert.direction === 'below' && rate < Number(alert.threshold));

      if (!triggered) continue;

      // Record history
      await this.historyRepo.save(
        this.historyRepo.create({
          alertId: alert.id,
          userId: alert.userId,
          currencyPair: alert.currencyPair,
          rateAtTrigger: rate,
          threshold: alert.threshold,
          direction: alert.direction,
        }),
      );

      alert.triggerCount += 1;

      if (alert.isRecurring) {
        // Re-arm unless maxTriggers reached
        if (alert.maxTriggers != null && alert.triggerCount >= alert.maxTriggers) {
          alert.isActive = false;
        }
        // else stays active for next trigger
      } else {
        alert.isActive = false;
      }

      await this.alertRepo.save(alert);
    }

    // Evaluate target orders
    const pendingOrders = await this.targetOrderRepo.find({
      where: { status: TargetOrderStatus.PENDING },
    });

    for (const order of pendingOrders) {
      if (order.expiresAt && order.expiresAt < now) {
        order.status = TargetOrderStatus.EXPIRED;
        await this.targetOrderRepo.save(order);
        continue;
      }

      const rate = currentRates[order.currencyPair];
      if (rate == null) continue;

      const shouldExecute =
        (order.direction === 'above' && rate >= Number(order.targetRate)) ||
        (order.direction === 'below' && rate <= Number(order.targetRate));

      if (shouldExecute) {
        order.status = TargetOrderStatus.EXECUTED;
        order.executedRate = rate;
        order.executedAt = now;
        await this.targetOrderRepo.save(order);
        // TODO: trigger actual FX conversion via FxConversionService
      }
    }
  }

  async getAnalytics() {
    const history = await this.historyRepo
      .createQueryBuilder('h')
      .select('h.currencyPair', 'currencyPair')
      .addSelect('COUNT(*)', 'triggerCount')
      .addSelect('AVG(EXTRACT(EPOCH FROM (h.triggerTime - a.createdAt)))', 'avgSecondsToTrigger')
      .leftJoin(FxAlert, 'a', 'a.id = h.alertId')
      .groupBy('h.currencyPair')
      .orderBy('"triggerCount"', 'DESC')
      .getRawMany();

    return history;
  }
}
