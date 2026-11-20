import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { In, Repository } from 'typeorm';
import { CurrenciesService } from '../currencies/currencies.service';
import { RateAlertEntity } from './rate-alert.entity';
import { CreateRateAlertDto } from './dto/create-rate-alert.dto';
import { RateAlertEvent, RateAlertTriggeredEvent } from './rate-alert.events';

export type RateAlert = RateAlertEntity;

const DEFAULT_MAX_PER_USER = 20;
const EVALUATION_CHUNK_SIZE = 500;

@Injectable()
export class RateAlertsService {
  private readonly logger = new Logger(RateAlertsService.name);

  constructor(
    @InjectRepository(RateAlertEntity)
    private readonly alertsRepo: Repository<RateAlertEntity>,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
    private readonly currencies: CurrenciesService,
  ) {}

  async create(userId: string, dto: CreateRateAlertDto): Promise<RateAlert> {
    const currencyPair = this.normalizePair(dto.currencyPair);
    const [base, quote] = currencyPair.split('/');
    this.currencies.validateCurrencyActive(base);
    this.currencies.validateCurrencyActive(quote);

    if (!Number.isFinite(dto.targetRate) || dto.targetRate <= 0) {
      throw new BadRequestException('targetRate must be a positive number');
    }

    const maxPerUser =
      this.config.get<number>('rateAlerts.maxPerUser') ?? DEFAULT_MAX_PER_USER;
    const activeCount = await this.alertsRepo.count({
      where: { userId, isActive: true },
    });
    if (activeCount >= maxPerUser) {
      throw new ConflictException(
        `A user may have at most ${maxPerUser} active rate alerts`,
      );
    }

    const duplicate = await this.alertsRepo.findOne({
      where: {
        userId,
        currencyPair,
        targetRate: dto.targetRate,
        direction: dto.direction,
        isActive: true,
        triggered: false,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'An identical active rate alert already exists',
      );
    }

    const alert = this.alertsRepo.create({
      userId,
      currencyPair,
      targetRate: dto.targetRate,
      direction: dto.direction,
      triggered: false,
      isActive: true,
      triggeredAt: null,
      deactivatedAt: null,
    });
    return this.alertsRepo.save(alert);
  }

  async findByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: RateAlert[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [items, total] = await this.alertsRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async deactivate(alertId: string, userId: string): Promise<void> {
    const alert = await this.alertsRepo.findOne({
      where: { id: alertId, userId, isActive: true },
    });
    if (!alert) {
      throw new NotFoundException(`Rate alert ${alertId} not found`);
    }
    alert.isActive = false;
    alert.deactivatedAt = new Date();
    await this.alertsRepo.save(alert);
  }

  async checkThresholds(rates: Record<string, number>): Promise<void> {
    const normalizedRates: Record<string, number> = {};
    for (const [pair, rate] of Object.entries(rates)) {
      if (typeof rate === 'number' && Number.isFinite(rate)) {
        normalizedRates[this.normalizePair(pair)] = rate;
      }
    }

    const pairs = Object.keys(normalizedRates);
    for (let i = 0; i < pairs.length; i += EVALUATION_CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + EVALUATION_CHUNK_SIZE);
      const alerts = await this.alertsRepo.find({
        where: {
          currencyPair: In(chunk),
          isActive: true,
          triggered: false,
        },
      });
      if (alerts.length === 0) continue;

      const result = await this.alertsRepo
        .createQueryBuilder()
        .update(RateAlertEntity)
        .set({ triggered: true, triggeredAt: () => 'CURRENT_TIMESTAMP' })
        .whereInIds(alerts.map((alert) => alert.id))
        .andWhere('"triggered" = false')
        .andWhere('"isActive" = true')
        .returning(['id'])
        .execute();

      const rows = (Array.isArray(result.raw) ? result.raw : []) as Array<{
        id: string;
      }>;
      const byId = new Map(alerts.map((alert) => [alert.id, alert]));
      for (const row of rows) {
        const alert = byId.get(row.id);
        if (!alert) continue;
        const rate = normalizedRates[alert.currencyPair];
        const event: RateAlertTriggeredEvent = {
          alertId: alert.id,
          userId: alert.userId,
          currencyPair: alert.currencyPair,
          rate,
          targetRate: Number(alert.targetRate),
          direction: alert.direction,
        };
        this.events.emit(RateAlertEvent.TRIGGERED, event);
        this.logger.log(
          `Rate alert ${alert.id} triggered for ${alert.currencyPair} at ${rate}`,
        );
      }
    }
  }

  private normalizePair(pair: string): string {
    const normalized = pair
      ?.trim()
      .toUpperCase()
      .replace(/[-_\s]/g, '/');
    if (!/^[A-Z]{3}\/[A-Z]{3}$/.test(normalized)) {
      throw new BadRequestException(`Unsupported currency pair ${pair}`);
    }
    return normalized;
  }
}
