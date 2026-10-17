import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Big from 'big.js';
import { WalletsService } from '../wallet/wallets.service';
import { ExchangeRateService } from '../fx/exchange-rate.service';
import { isSupportedCurrency } from '../currencies/supported-currencies';
import { PortfolioSnapshot } from './entities/portfolio-snapshot.entity';

export interface RebalancingRequest {
  userId: string;
  targetAllocations: Record<string, number>;
}

export interface RebalancingSuggestion {
  currency: string;
  currentAmount: number;
  targetAmount: number;
  action: 'buy' | 'sell' | 'hold';
  difference: number;
  currentAmountUsd: number;
  targetAmountUsd: number;
  differenceUsd: number;
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepo: Repository<PortfolioSnapshot>,
    private readonly walletsService: WalletsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  private validateTargetAllocations(
    targetAllocations: Record<string, number>,
  ): void {
    const entries = Object.entries(targetAllocations ?? {});
    if (entries.length === 0) {
      throw new BadRequestException('targetAllocations must not be empty');
    }

    let sum = 0;
    for (const [currency, pct] of entries) {
      if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 1) {
        throw new BadRequestException(
          `Invalid target allocation for ${currency}: must be a number between 0 and 1`,
        );
      }
      if (!isSupportedCurrency(currency)) {
        throw new BadRequestException(`Unsupported currency: ${currency}`);
      }
      sum += pct;
    }

    if (Math.abs(sum - 1) > 1e-6) {
      throw new BadRequestException(`targetAllocations must sum to 1 (got ${sum})`);
    }
  }

  private async getUsdRate(currency: string): Promise<number> {
    if (currency === 'USD') return 1;
    const { rate } = await this.exchangeRateService.getRate(currency, 'USD');
    return rate;
  }

  async computeRebalancing(
    params: RebalancingRequest,
  ): Promise<RebalancingSuggestion[]> {
    this.validateTargetAllocations(params.targetAllocations);

    const balances =
      await this.walletsService.getBalancesForAccount(params.userId);

    const holdings: Record<string, number> = {};
    for (const balance of balances) {
      holdings[balance.currency] =
        (holdings[balance.currency] ?? 0) + Number(balance.balance);
    }

    const holdingsUsd: Record<string, number> = {};
    let totalValueUsd = 0;
    for (const [currency, amount] of Object.entries(holdings)) {
      const usdAmount = Big(amount)
        .times(await this.getUsdRate(currency))
        .toNumber();
      holdingsUsd[currency] = usdAmount;
      totalValueUsd = Big(totalValueUsd).plus(usdAmount).toNumber();
    }

    const suggestions: RebalancingSuggestion[] = [];
    const allCurrencies = new Set([
      ...Object.keys(holdings),
      ...Object.keys(params.targetAllocations),
    ]);

    for (const currency of allCurrencies) {
      const currentAmount = holdings[currency] ?? 0;
      const currentAmountUsd = holdingsUsd[currency] ?? 0;
      const targetPct = params.targetAllocations[currency] ?? 0;
      const targetAmountUsd = Big(totalValueUsd).times(targetPct).toNumber();
      const differenceUsd = Big(targetAmountUsd)
        .minus(currentAmountUsd)
        .toNumber();

      const rate = await this.getUsdRate(currency);
      const targetAmount = Big(targetAmountUsd).div(rate).toNumber();
      const difference = Big(targetAmount).minus(currentAmount).toNumber();

      let action: 'buy' | 'sell' | 'hold' = 'hold';
      if (differenceUsd > 0.01) action = 'buy';
      else if (differenceUsd < -0.01) action = 'sell';

      suggestions.push({
        currency,
        currentAmount,
        targetAmount,
        action,
        difference,
        currentAmountUsd,
        targetAmountUsd,
        differenceUsd,
      });
    }

    await this.createSnapshot({
      userId: params.userId,
      holdings,
      totalValueUsd,
    });

    return suggestions;
  }

  async createSnapshot(params: {
    userId: string;
    holdings: Record<string, number>;
    totalValueUsd: number;
  }): Promise<PortfolioSnapshot> {
    const snapshot = this.snapshotRepo.create({
      ...params,
      snapshotDate: new Date(),
    });
    return this.snapshotRepo.save(snapshot);
  }

  async getHistory(userId: string): Promise<PortfolioSnapshot[]> {
    return this.snapshotRepo.find({
      where: { userId },
      order: { snapshotDate: 'DESC' },
    });
  }
}
