import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioSnapshot } from './entities/portfolio-snapshot.entity';

export interface RebalancingRequest {
  userId: string;
  holdings: Record<string, number>;
  totalValueUsd: number;
  targetAllocations: Record<string, number>;
}

export interface RebalancingSuggestion {
  currency: string;
  currentAmount: number;
  targetAmount: number;
  action: 'buy' | 'sell' | 'hold';
  difference: number;
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepo: Repository<PortfolioSnapshot>,
  ) {}

  async computeRebalancing(
    params: RebalancingRequest,
  ): Promise<RebalancingSuggestion[]> {
    const suggestions: RebalancingSuggestion[] = [];
    const allCurrencies = new Set([
      ...Object.keys(params.holdings),
      ...Object.keys(params.targetAllocations),
    ]);

    for (const currency of allCurrencies) {
      const currentAmount = params.holdings[currency] ?? 0;
      const targetPct = params.targetAllocations[currency] ?? 0;
      const targetAmount = params.totalValueUsd * targetPct;
      const difference = targetAmount - currentAmount;

      let action: 'buy' | 'sell' | 'hold' = 'hold';
      if (difference > 0.01) action = 'buy';
      else if (difference < -0.01) action = 'sell';

      suggestions.push({
        currency,
        currentAmount,
        targetAmount,
        action,
        difference,
      });
    }

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
