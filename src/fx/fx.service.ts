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

export interface ExecuteTradeDto {
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
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
    const { rate } = await this.rateService.getRate(
      dto.fromCurrency,
      dto.toCurrency,
    );
    const toAmount = parseFloat((dto.fromAmount * rate).toFixed(8));

    return this.dataSource.transaction(async (manager) => {
      this.wallets.adjustBalance(dto.userId, dto.fromCurrency, -dto.fromAmount);
      this.wallets.adjustBalance(dto.userId, dto.toCurrency, toAmount);

      const trade = manager.create(FxTrade, {
        userId: dto.userId,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        fromAmount: dto.fromAmount,
        toAmount,
        rate,
      });
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
      this.wallets.adjustBalance(trade.userId, trade.fromCurrency, trade.fromAmount);
      this.wallets.adjustBalance(trade.userId, trade.toCurrency, -trade.toAmount);

      trade.reversedAt = new Date();
      return manager.save(FxTrade, trade);
    });
  }

  async getRates(base: string, target: string) {
    return this.rateService.getRate(base, target);
  }
}
