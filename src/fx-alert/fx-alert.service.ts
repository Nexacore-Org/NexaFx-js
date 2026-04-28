import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  FxAlert,
  AlertStatus,
  AlertDirection,
  NotificationChannel,
} from '../entities/fx-alert.entity';
import {
  CreateFxAlertDto,
  FxAlertResponseDto,
  AlertAnalyticsDto,
  PairAnalytics,
} from '../dto/fx-alert.dto';
import { RateFetchedEvent } from '../events/rate-fetched.event';

const DEFAULT_TTL_DAYS = 30;

@Injectable()
export class FxAlertService {
  private readonly logger = new Logger(FxAlertService.name);

  constructor(
    @InjectRepository(FxAlert)
    private readonly alertRepo: Repository<FxAlert>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateFxAlertDto): Promise<FxAlertResponseDto> {
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);

    const alert = this.alertRepo.create({
      userId,
      pair: dto.pair.toUpperCase(),
      direction: dto.direction,
      threshold: dto.threshold,
      channelPreferences: dto.channelPreferences ?? [NotificationChannel.IN_APP],
      status: AlertStatus.ACTIVE,
      expiresAt,
      triggeredAt: null,
      triggerRate: null,
    });

    const saved = await this.alertRepo.save(alert);
    return this.toResponseDto(saved);
  }

  async findAllForUser(userId: string, currentRates?: Record<string, number>): Promise<FxAlertResponseDto[]> {
    const alerts = await this.alertRepo.find({
      where: { userId, status: AlertStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    return alerts.map((alert) => ({
      ...this.toResponseDto(alert),
      currentRate: currentRates?.[alert.pair] ?? null,
    }));
  }

  async delete(userId: string, alertId: string): Promise<{ message: string }> {
    const alert = await this.alertRepo.findOne({ where: { id: alertId } });

    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);
    if (alert.userId !== userId) throw new ForbiddenException('Access denied');

    await this.alertRepo.update(alertId, { status: AlertStatus.CANCELLED });
    return { message: 'Alert cancelled successfully' };
  }

  // ─── EVALUATION ────────────────────────────────────────────────────────────

  /**
   * Called asynchronously after each rate-fetch broadcast.
   * Must NOT block the broadcasting path.
   */
  async evaluateAlertsForPair(event: RateFetchedEvent): Promise<void> {
    const { pair, rate } = event;

    const activeAlerts = await this.alertRepo.find({
      where: { pair, status: AlertStatus.ACTIVE },
    });

    if (!activeAlerts.length) return;

    const toTrigger = activeAlerts.filter((alert) => this.shouldTrigger(alert, rate));

    if (!toTrigger.length) return;

    // Idempotent bulk update — mark all qualifying alerts in one query
    const ids = toTrigger.map((a) => a.id);
    await this.alertRepo
      .createQueryBuilder()
      .update(FxAlert)
      .set({
        status: AlertStatus.TRIGGERED,
        triggeredAt: () => 'NOW()',
        triggerRate: rate,
      })
      .whereInIds(ids)
      .andWhere('status = :status', { status: AlertStatus.ACTIVE }) // extra guard: idempotency
      .execute();

    // Dispatch notification events (non-blocking)
    for (const alert of toTrigger) {
      this.eventEmitter.emit('fx.alert.triggered', {
        alertId: alert.id,
        userId: alert.userId,
        pair: alert.pair,
        direction: alert.direction,
        threshold: alert.threshold,
        triggerRate: rate,
        channels: alert.channelPreferences,
      });

      this.logger.log(
        `Alert ${alert.id} triggered — ${pair} crossed ${alert.threshold} (actual: ${rate})`,
      );
    }
  }

  private shouldTrigger(alert: FxAlert, currentRate: number): boolean {
    if (alert.direction === AlertDirection.ABOVE) {
      return currentRate >= alert.threshold;
    }
    return currentRate <= alert.threshold;
  }

  // ─── AUTO-EXPIRY CRON ──────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleAlerts(): Promise<void> {
    const result = await this.alertRepo
      .createQueryBuilder()
      .update(FxAlert)
      .set({ status: AlertStatus.EXPIRED })
      .where('status = :status', { status: AlertStatus.ACTIVE })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} stale FX alert(s)`);
    }
  }

  // ─── ADMIN ANALYTICS ───────────────────────────────────────────────────────

  async getAnalytics(): Promise<AlertAnalyticsDto> {
    // Aggregate counts per status
    const statusCounts: { status: AlertStatus; count: string }[] = await this.alertRepo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.status')
      .getRawMany();

    const totals: Record<string, number> = {};
    for (const row of statusCounts) {
      totals[row.status] = parseInt(row.count, 10);
    }

    const totalAlerts = Object.values(totals).reduce((s, v) => s + v, 0);
    const triggeredAlerts = totals[AlertStatus.TRIGGERED] ?? 0;
    const expiredAlerts = totals[AlertStatus.EXPIRED] ?? 0;
    const activeAlerts = totals[AlertStatus.ACTIVE] ?? 0;
    const triggerRate = totalAlerts > 0 ? (triggeredAlerts / totalAlerts) * 100 : 0;

    // Avg time to trigger (ms)
    const avgRow = await this.alertRepo
      .createQueryBuilder('a')
      .select(
        'AVG(EXTRACT(EPOCH FROM (a.triggeredAt - a.createdAt)) * 1000)',
        'avgMs',
      )
      .where('a.status = :status', { status: AlertStatus.TRIGGERED })
      .andWhere('a.triggeredAt IS NOT NULL')
      .getRawOne<{ avgMs: string | null }>();

    const avgTimeToTriggerMs = avgRow?.avgMs ? parseFloat(avgRow.avgMs) : null;

    // Most popular pairs
    const pairRows: { pair: string; total: string; triggered: string }[] =
      await this.alertRepo
        .createQueryBuilder('a')
        .select('a.pair', 'pair')
        .addSelect('COUNT(*)', 'total')
        .addSelect(
          `SUM(CASE WHEN a.status = '${AlertStatus.TRIGGERED}' THEN 1 ELSE 0 END)`,
          'triggered',
        )
        .groupBy('a.pair')
        .orderBy('total', 'DESC')
        .limit(10)
        .getRawMany();

    const mostPopularPairs: PairAnalytics[] = pairRows.map((row) => {
      const total = parseInt(row.total, 10);
      const triggered = parseInt(row.triggered, 10);
      return {
        pair: row.pair,
        totalAlerts: total,
        triggeredAlerts: triggered,
        triggerRate: total > 0 ? (triggered / total) * 100 : 0,
      };
    });

    return {
      totalAlerts,
      triggeredAlerts,
      triggerRate: parseFloat(triggerRate.toFixed(2)),
      expiredAlerts,
      activeAlerts,
      mostPopularPairs,
      avgTimeToTriggerMs,
    };
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  private toResponseDto(alert: FxAlert): FxAlertResponseDto {
    return {
      id: alert.id,
      userId: alert.userId,
      pair: alert.pair,
      direction: alert.direction,
      threshold: alert.threshold,
      channelPreferences: alert.channelPreferences,
      status: alert.status,
      expiresAt: alert.expiresAt,
      triggeredAt: alert.triggeredAt,
      triggerRate: alert.triggerRate,
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
    };
  }
}
