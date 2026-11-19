import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual } from 'typeorm';
import { CronExpression } from '@nestjs/schedule';
import { ClusterCron } from '../common/locks/cluster-cron.decorator';
import { ExchangeRateCacheEntity } from './entities/exchange-rate-cache.entity';
import { ExchangeRateHistoryEntity } from './entities/exchange-rate-history.entity';
import { QueryExchangeRateHistoryDto } from './dto/query-exchange-rate-history.dto';
import { RatesGateway } from '../rates/rates.gateway';
import { ExchangeRateService } from '../fx/exchange-rate.service';
import { SUPPORTED_EXCHANGE_RATE_PAIRS } from './exchange-rate.constants';
import { RateAlertsService } from '../rate-alerts/rate-alerts.service';

const DEFAULT_CACHE_TTL_SECONDS = 60;

@Injectable()
export class ExchangeRatesService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly cacheTtlSeconds: number;

  constructor(
    @InjectRepository(ExchangeRateCacheEntity)
    private readonly cacheRepo: Repository<ExchangeRateCacheEntity>,
    @InjectRepository(ExchangeRateHistoryEntity)
    private readonly historyRepo: Repository<ExchangeRateHistoryEntity>,
    private readonly ratesGateway: RatesGateway,
    private readonly fxRateService: ExchangeRateService,
    private readonly rateAlerts: RateAlertsService,
  ) {
    this.cacheTtlSeconds = parseInt(
      process.env.EXCHANGE_RATE_CACHE_TTL || String(DEFAULT_CACHE_TTL_SECONDS),
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const rates = await this.getRates();
      this.ratesGateway.seedCurrentRates(
        rates.map((r) => ({ currencyPair: r.pair, rate: Number(r.rate) })),
      );
    } catch (error) {
      this.logger.warn(
        `Unable to seed live rate snapshot at startup: ${error.message}`,
      );
    }
  }

  async getRates(): Promise<ExchangeRateCacheEntity[]> {
    const cached = await this.cacheRepo.find({
      where: { expiresAt: MoreThan(new Date()) },
    });

    if (cached.length > 0) {
      return cached;
    }

    return this.fetchAndCacheRates();
  }

  async getRateByPair(pair: string): Promise<ExchangeRateCacheEntity | null> {
    const normalized = pair.toUpperCase();
    if (!SUPPORTED_EXCHANGE_RATE_PAIRS.includes(normalized)) {
      throw new NotFoundException(`Unsupported currency pair ${pair}`);
    }

    const cached = await this.cacheRepo.findOne({
      where: { pair: normalized, expiresAt: MoreThan(new Date()) },
    });

    if (cached) {
      return cached;
    }

    const rates = await this.fetchAndCacheRates();
    return rates.find((r) => r.pair === normalized) || null;
  }

  async getHistory(dto: QueryExchangeRateHistoryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    if (dto.pair && !SUPPORTED_EXCHANGE_RATE_PAIRS.includes(dto.pair)) {
      throw new BadRequestException(`Unsupported currency pair ${dto.pair}`);
    }
    if (dto.from && dto.to && new Date(dto.from) > new Date(dto.to)) {
      throw new BadRequestException('"from" must not be after "to"');
    }

    const qb = this.historyRepo.createQueryBuilder('h');

    if (dto.pair) {
      qb.andWhere('h.pair = :pair', { pair: dto.pair });
    }

    if (dto.from) {
      qb.andWhere('h.recordedAt >= :from', { from: new Date(dto.from) });
    }

    if (dto.to) {
      qb.andWhere('h.recordedAt <= :to', { to: new Date(dto.to) });
    }

    qb.orderBy('h.recordedAt', 'DESC');
    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async fetchAndCacheRates(): Promise<ExchangeRateCacheEntity[]> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.cacheTtlSeconds * 1000);

    const rates: ExchangeRateCacheEntity[] = [];
    const refreshedRates: Record<string, number> = {};

    for (const pair of SUPPORTED_EXCHANGE_RATE_PAIRS) {
      let rate: number;
      let provider: string;
      try {
        ({ rate, provider } = await this.fetchRateFromSource(pair));
      } catch (error) {
        // Isolate per-pair failures: keep the previous row and continue.
        this.logger.warn(
          `Failed to refresh ${pair}: ${(error as Error).message}`,
        );
        const previous = await this.cacheRepo.findOne({ where: { pair } });
        if (previous) rates.push(previous);
        continue;
      }

      // Upsert into cache
      let cached = await this.cacheRepo.findOne({ where: { pair } });
      if (cached) {
        cached.rate = rate;
        cached.source = provider;
        cached.cachedAt = now;
        cached.expiresAt = expiresAt;
      } else {
        cached = this.cacheRepo.create({
          pair,
          rate,
          source: provider,
          cachedAt: now,
          expiresAt,
        });
      }
      await this.cacheRepo.save(cached);
      rates.push(cached);
      refreshedRates[pair] = rate;

      // Store in history
      const historyEntry = this.historyRepo.create({
        pair,
        rate,
        source: provider,
        recordedAt: now,
      });
      await this.historyRepo.save(historyEntry);

      // Push the new rate to clients subscribed to the /rates namespace.
      this.ratesGateway.broadcastRateUpdate(pair, rate);
    }

    if (Object.keys(refreshedRates).length > 0) {
      await this.rateAlerts.checkThresholds(refreshedRates);
    }

    return rates;
  }

  private async fetchRateFromSource(
    pair: string,
  ): Promise<{ rate: number; provider: string }> {
    const [base = '', quote = ''] = pair.split('/');
    const result = await this.fxRateService.getRate(base, quote);
    return { rate: Number(result.rate.toFixed(8)), provider: result.provider };
  }

  async calculateConversion(from: string, to: string, amount: number) {
    const pair = `${from.toUpperCase()}/${to.toUpperCase()}`;
    const inversePair = `${to.toUpperCase()}/${from.toUpperCase()}`;
    const rateObj = await this.getRateByPair(pair);
    let rate = rateObj ? Number(rateObj.rate) : null;
    if (!rate) {
      const invObj = await this.getRateByPair(inversePair);
      if (invObj && Number(invObj.rate) > 0) {
        rate = Number((1 / Number(invObj.rate)).toFixed(8));
      } else {
        throw new BadRequestException('No rate available for pair');
      }
    }
    const convertedAmount = Number((amount * rate).toFixed(8));
    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount,
      convertedAmount,
      rate,
    };
  }

  @ClusterCron(CronExpression.EVERY_MINUTE, 'exchange-rates:refresh-expired')
  async refreshExpiredRates() {
    const expiredCount = await this.cacheRepo.count({
      where: { expiresAt: LessThanOrEqual(new Date()) },
    });

    if (expiredCount > 0) {
      this.logger.log(`Refreshing ${expiredCount} expired exchange rate(s)`);
      await this.fetchAndCacheRates();
    }
  }
}
