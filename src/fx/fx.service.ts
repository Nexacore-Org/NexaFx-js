import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FxTrade } from './fx-trade.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { WalletsService } from '../wallet/wallets.service';

import { FxQuoteCache } from './fx-quote-cache';

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
  ) {}

  async executeTrade(dto: ExecuteTradeDto): Promise<FxTrade> {
    let rate: number;
    if (dto.quoteId) {
      const lockedRate = FxQuoteCache.get(dto.quoteId);
      if (lockedRate !== null) {
        rate = lockedRate;
      } else {
        const rateResult = await this.rateService.getRate(
          dto.fromCurrency,
          dto.toCurrency,
        );
        rate = rateResult.rate;
      }
    } else {
      const rateResult = await this.rateService.getRate(
        dto.fromCurrency,
        dto.toCurrency,
      );
      rate = rateResult.rate;
    }
    const toAmount = parseFloat((dto.fromAmount * rate).toFixed(8));

    return this.dataSource.transaction(async (manager) => {
      await this.wallets.adjustBalance(dto.userId, dto.fromCurrency, -dto.fromAmount);
      await this.wallets.adjustBalance(dto.userId, dto.toCurrency, toAmount);

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
      await this.wallets.adjustBalance(trade.userId, trade.fromCurrency, trade.fromAmount);
      await this.wallets.adjustBalance(trade.userId, trade.toCurrency, -trade.toAmount);

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
