import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { PortfolioSnapshot } from '../entities/portfolio-snapshot.entity';
import { WalletBalanceService } from './wallet-balance.service';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepo: Repository<PortfolioSnapshot>,
    private readonly walletBalanceService: WalletBalanceService,
  ) {}

  async takeSnapshot(userId: string, displayCurrency = 'USD'): Promise<PortfolioSnapshot> {
    const portfolio = await this.walletBalanceService.getPortfolio(userId, displayCurrency);
    const today = new Date().toISOString().split('T')[0];

    // Upsert: one snapshot per user per day
    const existing = await this.snapshotRepo.findOne({
      where: { userId, snapshotDate: today },
    });

    const walletBreakdown = portfolio.wallets.map((w) => ({
      walletId: w.walletId,
      currency: w.currency,
      value: w.total,
      fxRate: 1, // Placeholder — real FX rates from FxAggregatorService
    }));

    const snapshot = existing ?? this.snapshotRepo.create({ userId, snapshotDate: today });
    snapshot.displayCurrency = displayCurrency;
    snapshot.totalValue = portfolio.totalInDisplayCurrency;
    snapshot.walletBreakdown = walletBreakdown;
    snapshot.fxRates = null;

    return this.snapshotRepo.save(snapshot);
  }

  async getHistory(
    userId: string,
    from: Date,
    to: Date,
    page = 1,
    limit = 30,
  ): Promise<{ data: PortfolioSnapshot[]; total: number; page: number; limit: number }> {
    const fromDate = from.toISOString().split('T')[0];
    const toDate = to.toISOString().split('T')[0];

    const [data, total] = await this.snapshotRepo.findAndCount({
      where: {
        userId,
        snapshotDate: Between(fromDate, toDate) as any,
      },
      order: { snapshotDate: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async getSummary(userId: string): Promise<{
    currentValue: number;
    change7d: number | null;
    change30d: number | null;
    allTimeHigh: number;
    allTimeLow: number;
  }> {
    const snapshots = await this.snapshotRepo.find({
      where: { userId },
      order: { snapshotDate: 'DESC' },
    });

    if (snapshots.length === 0) {
      throw new NotFoundException('No portfolio snapshots found for user');
    }

    const latest = snapshots[0];
    const currentValue = Number(latest.totalValue);

    const allValues = snapshots.map((s) => Number(s.totalValue));
    const allTimeHigh = Math.max(...allValues);
    const allTimeLow = Math.min(...allValues);

    const pctChange = (current: number, previous: number): number =>
      previous === 0 ? 0 : ((current - previous) / previous) * 100;

    const findSnapshotDaysAgo = (days: number): PortfolioSnapshot | undefined => {
      const target = new Date();
      target.setDate(target.getDate() - days);
      const targetDate = target.toISOString().split('T')[0];
      return snapshots.find((s) => s.snapshotDate <= targetDate);
    };

    const snap7d = findSnapshotDaysAgo(7);
    const snap30d = findSnapshotDaysAgo(30);

    return {
      currentValue,
      change7d: snap7d ? pctChange(currentValue, Number(snap7d.totalValue)) : null,
      change30d: snap30d ? pctChange(currentValue, Number(snap30d.totalValue)) : null,
      allTimeHigh,
      allTimeLow,
    };
  }
}
