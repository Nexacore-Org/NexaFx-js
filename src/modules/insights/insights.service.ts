import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { LedgerEntry, LedgerEntryType } from '../../ledger/ledger-entry.entity';

/** Ledger-derived monthly inflow/outflow, bucketed in TypeScript so it is DB-portable (issue #1390). */
@Injectable()
export class InsightsService {
  constructor(@InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>) {}

  async getMonthlySummary(userId: string, months = 6, currency?: string) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - Math.min(Math.max(months, 1), 24), 1);
    since.setUTCHours(0, 0, 0, 0);
    const entries = await this.ledger.find({
      where: { userId, createdAt: MoreThanOrEqual(since), ...(currency ? { currency } : {}) },
    });
    const buckets = new Map<string, { month: string; currency: string; inflow: number; outflow: number }>();
    for (const e of entries) {
      const month = e.createdAt.toISOString().slice(0, 7);
      const b = buckets.get(`${month}|${e.currency}`) ?? { month, currency: e.currency, inflow: 0, outflow: 0 };
      if (e.type === LedgerEntryType.CREDIT) b.inflow += Number(e.amount);
      else b.outflow += Number(e.amount);
      buckets.set(`${month}|${e.currency}`, b);
    }
    return [...buckets.values()]
      .map((b) => ({ ...b, net: b.inflow - b.outflow }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}
