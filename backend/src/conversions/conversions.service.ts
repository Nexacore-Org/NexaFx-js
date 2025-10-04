import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Conversion, ConversionStatus } from './entities/conversion.entity';
import { QuoteDto, ExecuteDto } from './dto/conversion.dto';
import currency from 'currency.js';
import { MultiCurrencyWalletService } from '../wallets/multi-currency-wallet.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class ConversionsService {
  constructor(
    @InjectRepository(Conversion) private readonly repo: Repository<Conversion>,
    private readonly walletService: MultiCurrencyWalletService,
    private readonly ratesService: ExchangeRatesService,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async quote(dto: QuoteDto) {
    const rateEntity = await this.ratesService.getRate(dto.fromCurrency, dto.toCurrency);
    if (!rateEntity) throw new NotFoundException('Rate not available');
    const rate = currency(rateEntity.rate);
    const toAmount = rate.multiply(dto.fromAmount).value;
    const quoteId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Lock quote in Redis for 60s
    await this.redis.setJSON(`quote:${quoteId}`, { rate: rate.value, toAmount }, 60);
    const created = this.repo.create({
      userId: dto.userId,
      fromCurrency: dto.fromCurrency.toUpperCase(),
      toCurrency: dto.toCurrency.toUpperCase(),
      fromAmount: String(dto.fromAmount),
      toAmount: String(toAmount),
      usedRate: String(rate.value),
      status: ConversionStatus.QUOTED,
      quoteId,
    });
    const saved = await this.repo.save(created);
    return { quoteId, conversionId: saved.id, toAmount: String(toAmount), rate: String(rate.value) };
  }

  async execute(dto: ExecuteDto) {
    const conv = await this.repo.findOne({ where: { quoteId: dto.quoteId } });
    if (!conv) throw new NotFoundException('Quote not found');
    const cached = await this.redis.getJSON<{ rate: number; toAmount: number }>(`quote:${dto.quoteId}`);
    if (!cached) throw new NotFoundException('Quote expired');

    // Slippage guard: re-check current rate within 0.5% of quoted
    const latest = await this.ratesService.getRate(conv.fromCurrency, conv.toCurrency);
    if (!latest) throw new NotFoundException('Rate not available');
    const latestRate = Number(latest.rate);
    const diff = Math.abs((latestRate - Number(conv.usedRate)) / Number(conv.usedRate));
    if (diff > 0.005) {
      throw new Error('Slippage exceeded 0.5%');
    }

    // Limits stub: enforce simple per-transaction cap based on getLimits
    const limits = await this.getLimits(conv.userId);
    if (Number(conv.toAmount) > limits.perTransaction) {
      throw new Error('Amount exceeds per-transaction limit');
    }

    // Atomic transaction: debit fromCurrency, credit toCurrency
    await this.dataSource.transaction(async manager => {
      // In a full impl, adjust balances in wallet table with SELECT ... FOR UPDATE
      // Here we only mark executed to demonstrate atomicity
      conv.status = ConversionStatus.EXECUTED;
      await manager.getRepository(Conversion).save(conv);
    });

    await this.redis.del(`quote:${dto.quoteId}`);
    return conv;
  }

  async get(id: string) {
    const conv = await this.repo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversion not found');
    return conv;
  }

  async history(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async reverse(id: string) {
    const conv = await this.get(id);
    conv.status = ConversionStatus.REVERSED;
    await this.repo.save(conv);
    return conv;
  }

  async getLimits(userId: string) {
    // Placeholder: use KYC tiers later
    return {
      perTransaction: 500,
      daily: 2000,
      currency: 'USD',
      tier: 'T1',
    };
  }
}


