import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExchangeRate, RateHistory } from './entities/rate.entity';
import { RateProviderService } from './providers/rate-provider.service';
import { SetMarginDto, UpdateRateDto } from './dto/rate.dto';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly ratesRepo: Repository<ExchangeRate>,
    @InjectRepository(RateHistory)
    private readonly historyRepo: Repository<RateHistory>,
    private readonly provider: RateProviderService,
    private readonly redis: RedisService,
  ) {}

  async getCurrentRates(base?: string, quote?: string) {
    const where: any = {};
    if (base) where.base = base.toUpperCase();
    if (quote) where.quote = quote.toUpperCase();
    return this.ratesRepo.find({ where });
  }

  async getRate(base: string, quote: string) {
    const b = base.toUpperCase();
    const q = quote.toUpperCase();
    const cacheKey = `rate:${b}:${q}`;
    const cached = await this.redis.getJSON<{ rate: string; margin?: string }>(cacheKey);
    if (cached) return { base: b, quote: q, rate: cached.rate, margin: cached.margin ?? '0' } as any;
    const db = await this.ratesRepo.findOne({ where: { base: b, quote: q } });
    if (db) {
      await this.redis.setJSON(cacheKey, { rate: db.rate, margin: db.margin }, 60);
    }
    return db;
  }

  async getHistory(base?: string, quote?: string) {
    const where: any = {};
    if (base) where.base = base.toUpperCase();
    if (quote) where.quote = quote.toUpperCase();
    return this.historyRepo.find({ where, order: { timestamp: 'DESC' } });
  }

  async manualUpdate(dto: UpdateRateDto) {
    const { base, quote, rate } = dto;
    const entity = await this.ratesRepo.findOne({ where: { base: base.toUpperCase(), quote: quote.toUpperCase() } });
    if (!entity) {
      const created = this.ratesRepo.create({ base: base.toUpperCase(), quote: quote.toUpperCase(), rate });
      await this.ratesRepo.save(created);
    } else {
      entity.rate = rate;
      await this.ratesRepo.save(entity);
    }
    await this.historyRepo.save(this.historyRepo.create({ base: base.toUpperCase(), quote: quote.toUpperCase(), rate }));
    await this.redis.setJSON(`rate:${base.toUpperCase()}:${quote.toUpperCase()}`, { rate }, 60);
    return this.getRate(base, quote);
  }

  async setMargin(dto: SetMarginDto) {
    const entity = await this.ratesRepo.findOne({ where: { base: dto.base.toUpperCase(), quote: dto.quote.toUpperCase() } });
    if (!entity) {
      const created = this.ratesRepo.create({ base: dto.base.toUpperCase(), quote: dto.quote.toUpperCase(), rate: '0', margin: dto.margin });
      return this.ratesRepo.save(created);
    }
    entity.margin = dto.margin;
    const saved = await this.ratesRepo.save(entity);
    await this.redis.setJSON(`rate:${entity.base}:${entity.quote}`, { rate: saved.rate, margin: saved.margin }, 60);
    return saved;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledUpdate(): Promise<void> {
    // For MVP, update NGN/USD/EUR/GBP cross pairs
    const bases = ['NGN', 'USD', 'EUR', 'GBP'];
    const quotes = ['NGN', 'USD', 'EUR', 'GBP'];
    for (const b of bases) {
      for (const q of quotes) {
        if (b === q) continue;
        try {
          const best = await this.provider.fetchBestRate(b, q);
          await this.manualUpdate({ base: b, quote: q, rate: String(best) });
        } catch (e) {
          this.logger.warn(`Failed to update ${b}/${q}: ${e.message}`);
        }
      }
    }
  }
}


