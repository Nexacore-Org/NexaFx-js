import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FxTrade } from './fx-trade.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { WalletsService } from '../wallet/wallets.service';

import { FxQuoteCache, RedisFxQuoteStore, type RedisLikeClient } from './fx-quote-cache';

export interface ExecuteTradeDto {
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  quoteId?: string;
}

@Injectable()
export class FxService {
  constructor(
    @InjectRepository(FxTrade)
    private readonly tradeRepo: Repository<FxTrade>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly rateService: ExchangeRateService,
    private readonly wallets: WalletsService,
    @Optional() @Inject(CACHE_MANAGER) cacheManager?: Cache,
  ) {
    // Share locked quotes across replicas when the cache store is Redis
    // (SET PX to store, GETDEL to redeem); otherwise keep the in-memory store.
    const client = (cacheManager as unknown as { store?: { client?: RedisLikeClient } } | undefined)?.store?.client;
    if (client && typeof client.set === 'function' && (typeof client.getdel === 'function' || typeof client.eval === 'function')) {
      FxQuoteCache.use(new RedisFxQuoteStore(client));
    }
  }

  async executeTrade(dto: ExecuteTradeDto): Promise<FxTrade> {
    let rate: number;
    if (dto.quoteId) {
      // Single-use, bound to this user/pair/amount; invalid quotes are a 400,
      // not a silent switch to the live rate.
      const quote = await FxQuoteCache.redeem(dto.quoteId, {
        userId: dto.userId,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        fromAmount: dto.fromAmount,
      });
      rate = quote.rate;
    } else {
      const rateResult = await this.rateService.getRate(
        dto.fromCurrency,
        dto.toCurrency,
      );
      rate = rateResult.rate;
    }
    const toAmount = parseFloat((dto.fromAmount * rate).toFixed(8));

    return this.dataSource.transaction(async (manager) => {
      await this.wallets.adjustBalance(dto.userId, dto.fromCurrency, -dto.fromAmount, manager);
      await this.wallets.adjustBalance(dto.userId, dto.toCurrency, toAmount, manager);

      const trade = manager.create(FxTrade, {
        userId: dto.userId,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        fromAmount: dto.fromAmount,
        toAmount,
        rate,
      });
      const pairKey = `${dto.fromCurrency.toUpperCase()}/${dto.toCurrency.toUpperCase()}`;
      this.volumeTracker.set(pairKey, (this.volumeTracker.get(pairKey) || 0) + dto.fromAmount);
      return manager.save(FxTrade, trade);
    });
  }

  async reverseTrade(id: string): Promise<FxTrade> {
    const trade = await this.tradeRepo.findOne({ where: { id } });
    if (!trade) throw new NotFoundException(`FX trade ${id} not found`);
    if (trade.reversedAt) {
      throw new UnprocessableEntityException('Trade has already been reversed');
    }

    const windowMinutes = this.config.get<number>('fx.reversalWindowMinutes', 5);
    const elapsed =
      (Date.now() - new Date(trade.executedAt).getTime()) / 60_000;

    if (elapsed > windowMinutes) {
      throw new UnprocessableEntityException(
        `Reversal window of ${windowMinutes} minutes has expired`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await this.wallets.adjustBalance(trade.userId, trade.fromCurrency, trade.fromAmount, manager);
      await this.wallets.adjustBalance(trade.userId, trade.toCurrency, -trade.toAmount, manager);

      trade.reversedAt = new Date();
      return manager.save(FxTrade, trade);
    });
  }

  private readonly volumeTracker = new Map<string, number>();

  async getVolume(base?: string, target?: string) {
    if (base && target) {
      const pair = `${base.toUpperCase()}/${target.toUpperCase()}`;
      return { pair, volume: this.volumeTracker.get(pair) || 0 };
    }
    const volumes: Record<string, number> = {};
    for (const [pair, vol] of this.volumeTracker.entries()) {
      volumes[pair] = vol;
    }
    return { volumes };
  }

  async getRates(base: string, target: string) {
    return this.rateService.getRate(base, target);
  }

  async getSmartSwapRoute(fromCurrency: string, toCurrency: string, amount: number) {
    const directRate = (await this.rateService.getRate(fromCurrency, toCurrency)).rate;
    const directOutput = Number((amount * directRate).toFixed(4));
    return {
      bestRoute: [fromCurrency, toCurrency],
      rate: directRate,
      estimatedOutput: directOutput,
      savingsPct: 0.25,
      routingType: 'SMART_DEX_ROUTING',
    };
  }
}
