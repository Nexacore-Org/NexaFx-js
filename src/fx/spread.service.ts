import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrencyPair } from './currency-pair.entity';
import { AuditService } from '../audit/audit.service';

/**
 * Persists FX spreads on `currency_pairs.spreadPercent` (issue #1520), the same
 * column `FxService` reads when it prices a trade. Replaces the in-memory map in
 * AdminService that nothing read and that was lost on restart.
 */
@Injectable()
export class SpreadService {
  constructor(
    @InjectRepository(CurrencyPair) private readonly pairs: Repository<CurrencyPair>,
    private readonly audit: AuditService,
  ) {}

  async getSpreads(): Promise<Record<string, number>> {
    const all = await this.pairs.find();
    const result: Record<string, number> = {};
    for (const p of all) {
      result[`${p.fromCurrency}/${p.toCurrency}`] = Number(p.spreadPercent);
    }
    return result;
  }

  async updateSpread(pair: string, spreadPercentage: number, adminUserId: string, reason?: string) {
    const [fromCurrency, toCurrency] = pair.toUpperCase().split('/');
    const existing = await this.pairs.findOne({ where: { fromCurrency, toCurrency } });
    if (!existing) {
      throw new NotFoundException(`Unknown currency pair ${pair.toUpperCase()}`);
    }

    const before = { pair: `${fromCurrency}/${toCurrency}`, spreadPercentage: Number(existing.spreadPercent) };
    existing.spreadPercent = spreadPercentage;
    await this.pairs.save(existing);

    await this.audit.log({
      userId: adminUserId,
      action: 'admin.spread.update',
      entityType: 'currency_pair',
      entityId: existing.id,
      before,
      after: { pair: before.pair, spreadPercentage },
      reason,
    });

    return { pair: before.pair, spreadPercentage };
  }
}
