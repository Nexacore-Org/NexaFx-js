import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExchangeRateCacheEntity } from './entities/exchange-rate-cache.entity';
import { ExchangeRateHistoryEntity } from './entities/exchange-rate-history.entity';
import { QueryExchangeRateHistoryDto } from './dto/query-exchange-rate-history.dto';

const DEFAULT_CACHE_TTL_SECONDS = 60;
const SUPPORTED_PAIRS = ['USD/NGN', 'USD/EUR', 'USD/GBP', 'EUR/NGN', 'GBP/NGN'];

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly cacheTtlSeconds: number;

  constructor(
    @InjectRepository(ExchangeRateCacheEntity)
    private readonly cacheRepo: Repository<ExchangeRateCacheEntity>,
    @InjectRepository(ExchangeRateHistoryEntity)
    private readonly historyRepo: Repository<ExchangeRateHistoryEntity>,
  ) {
    this.cacheTtlSeconds = parseInt(
      process.env.EXCHANGE_RATE_CACHE_TTL || String(DEFAULT_CACHE_TTL_SECONDS),
      10,
    );
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
    const cached = await this.cacheRepo.findOne({
      where: { pair, expiresAt: MoreThan(new Date()) },
    });

    if (cached) {
      return cached;
    }

    const rates = await this.fetchAndCacheRates();
    return rates.find((r) => r.pair === pair) || null;
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
      const rate = await this.fetchRateFromSource(pair);

      // Upsert into cache
      let cached = await this.cacheRepo.findOne({ where: { pair } });
      if (cached) {
        cached.rate = rate;
        cached.source = 'stellar';
        cached.cachedAt = now;
        cached.expiresAt = expiresAt;
      } else {
        cached = this.cacheRepo.create({
          pair,
          rate,
          source: 'stellar',
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
        source: 'stellar',
        recordedAt: now,
      });
      await this.historyRepo.save(historyEntry);
    }

    return rates;
  }

  private async fetchRateFromSource(pair: string): Promise<number> {
    try {
      // Mock Stellar DEX rate fetch
      // In production, this would call the Stellar DEX API
      const baseRates: Record<string, number> = {
        'USD/NGN': 1550.0,
        'USD/EUR': 0.92,
        'USD/GBP': 0.79,
        'EUR/NGN': 1685.0,
        'GBP/NGN': 1962.0,
      };

      const baseRate = baseRates[pair] || 1.0;
      const fluctuation = (Math.random() - 0.5) * 0.02;
      return Number((baseRate * (1 + fluctuation)).toFixed(8));
    } catch (error) {
      this.logger.error(`Failed to fetch rate for ${pair}: ${error.message}`);
      throw new Error(`Unable to fetch exchange rate for ${pair}`);
    }
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
        rate = 1.0;
      }
    }
    const convertedAmount = Number((amount * rate).toFixed(8));
    return { from: from.toUpperCase(), to: to.toUpperCase(), amount, convertedAmount, rate };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshExpiredRates() {
    const expired = await this.cacheRepo.count({
      where: { expiresAt: MoreThan(new Date()) },
    });

    if (expired === 0) {
      this.logger.log('Refreshing expired exchange rates');
      await this.fetchAndCacheRates();
    }
  }
}
