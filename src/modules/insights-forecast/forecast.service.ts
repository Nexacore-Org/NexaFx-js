import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { LedgerEntry, LedgerEntryType } from '../../ledger/ledger-entry.entity';

const DAY_MS = 86_400_000;

/** Linear-average balance projection from ledger history (issue #1391). */
@Injectable()
export class ForecastService {
  constructor(@InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>) {}

  async projectBalance(userId: string, currency: string, horizonDays: number, basisDays = 90) {
    const rows = await this.ledger.find({
      where: { userId, currency, createdAt: MoreThanOrEqual(new Date(Date.now() - basisDays * DAY_MS)) },
      order: { createdAt: 'ASC' },
    });
    if (rows.length === 0 || Date.now() - rows[0].createdAt.getTime() < 14 * DAY_MS) {
      return { currency, insufficientHistory: true };
    }
    const daily = new Map<string, number>();
    for (const r of rows) {
      const day = r.createdAt.toISOString().slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + (r.type === LedgerEntryType.CREDIT ? 1 : -1) * Number(r.amount));
    }
    const nets = [...daily.values()];
    const mean = nets.reduce((a, b) => a + b, 0) / basisDays;
    const std = Math.sqrt(nets.reduce((a, n) => a + (n - mean) ** 2, 0) / nets.length);
    const currentBalance = Number(rows[rows.length - 1].balanceAfter);
    const projectedBalance = currentBalance + mean * horizonDays;
    const band = std * Math.sqrt(horizonDays);
    return { currency, currentBalance, projectedBalance, low: projectedBalance - band, high: projectedBalance + band, basisDays, method: 'linear-average' };
  }
}
