import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerEntry } from '../../../double-entry-ledger/ledger-entry.entity';

export interface LedgerCheckResult {
  status: 'BALANCED' | 'DISCREPANCY';
  details: Array<{
    currency: string;
    totalCredits: number;
    totalDebits: number;
    difference: number;
  }>;
}

@Injectable()
export class LedgerVerificationService {
  private readonly logger = new Logger(LedgerVerificationService.name);

  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
  ) {}

  async verifyLedger(): Promise<LedgerCheckResult> {
    const rows = await this.ledgerRepo
      .createQueryBuilder('e')
      .select('e.currency', 'currency')
      .addSelect('SUM(e.credit)', 'totalCredits')
      .addSelect('SUM(e.debit)', 'totalDebits')
      .groupBy('e.currency')
      .getRawMany<{ currency: string; totalCredits: string; totalDebits: string }>();

    const details = rows.map((r) => {
      const totalCredits = parseFloat(r.totalCredits ?? '0');
      const totalDebits = parseFloat(r.totalDebits ?? '0');
      return { currency: r.currency, totalCredits, totalDebits, difference: totalCredits - totalDebits };
    });

    const balanced = details.every((d) => Math.abs(d.difference) < 0.000001);

    if (!balanced) {
      this.logger.warn('Ledger discrepancy detected', details);
    }

    return { status: balanced ? 'BALANCED' : 'DISCREPANCY', details };
  }
}
