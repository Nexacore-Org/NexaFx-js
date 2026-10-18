import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExchangeRateCacheEntity } from './entities/exchange-rate-cache.entity';
import { ExchangeRateHistoryEntity } from './entities/exchange-rate-history.entity';
import { QueryExchangeRateHistoryDto } from './dto/query-exchange-rate-history.dto';
import { RatesGateway } from '../rates/rates.gateway';
import { ExchangeRateService } from '../fx/exchange-rate.service';

const DEFAULT_CACHE_TTL_SECONDS = 60;
const SUPPORTED_PAIRS = ['USD/NGN', 'USD/EUR', 'USD/GBP', 'EUR/NGN', 'GBP/NGN'];

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
    if (!SUPPORTED_PAIRS.includes(normalized)) {
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

    const qb = this.historyRepo.createQueryBuilder('h');

    if (dto.pair) {
      qb.andWhere('h.pair = :pair', { pair: dto.pair });
    }

    if (dto.from) {
      qb.andWhere('h.recorded_at >= :from', { from: new Date(dto.from) });
    }

    if (dto.to) {
      qb.andWhere('h.recorded_at <= :to', { to: new Date(dto.to) });
    }

    qb.orderBy('h.recorded_at', 'DESC');
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

    for (const pair of SUPPORTED_PAIRS) {
      const { rate, provider } = await this.fetchRateFromSource(pair);

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
    return { from: from.toUpperCase(), to: to.toUpperCase(), amount, convertedAmount, rate };
  }

  @Cron(CronExpression.EVERY_MINUTE)
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
