import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { BankAccount } from '../entities/bank-account.entity';

// We reference the banking-local Transaction entity (src/banking uses its own Transaction import)
// We use a raw query approach to avoid cross-module entity coupling issues.

@Injectable()
export class BankStatementService {
  private readonly logger = new Logger(BankStatementService.name);

  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepo: Repository<BankAccount>,
  ) {}

  /**
   * GET /bank-accounts/:id/transfers
   * Returns paginated deposit/withdrawal history for a bank account.
   */
  async getTransferHistory(
    userId: string,
    bankAccountId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const account = await this.bankAccountRepo.findOne({
      where: { id: bankAccountId, userId },
    });
    if (!account) throw new NotFoundException(`Bank account ${bankAccountId} not found`);

    // Query transactions linked to this bank account via metadata
    const offset = (page - 1) * limit;
    const [data, total] = await this.bankAccountRepo.manager
      .getRepository('transactions')
      .createQueryBuilder('t')
      .where(`t.metadata->>'bankAccountId' = :bankAccountId`, { bankAccountId })
      .orderBy('t.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * GET /bank-accounts/:id/statement?month=YYYY-MM
   * Generates a plain-text/CSV statement (no headless browser required).
   */
  async generateStatement(
    userId: string,
    bankAccountId: string,
    month: string, // YYYY-MM
  ): Promise<{ filename: string; content: string; contentType: string }> {
    const account = await this.bankAccountRepo.findOne({
      where: { id: bankAccountId, userId },
    });
    if (!account) throw new NotFoundException(`Bank account ${bankAccountId} not found`);

    const [year, mon] = month.split('-').map(Number);
    const from = new Date(year, mon - 1, 1);
    const to = new Date(year, mon, 0, 23, 59, 59, 999);

    const transactions = await this.bankAccountRepo.manager
      .getRepository('transactions')
      .createQueryBuilder('t')
      .where(`t.metadata->>'bankAccountId' = :bankAccountId`, { bankAccountId })
      .andWhere('t.createdAt BETWEEN :from AND :to', { from, to })
      .orderBy('t.createdAt', 'ASC')
      .getMany();

    const csv = this.buildCsv(account, transactions, month);

    return {
      filename: `statement-${bankAccountId}-${month}.csv`,
      content: csv,
      contentType: 'text/csv',
    };
  }

  private buildCsv(account: BankAccount, transactions: any[], month: string): string {
    const header = [
      `Bank Statement — ${account.bankName} (****${account.accountNumberLast4})`,
      `Period: ${month}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Date,Type,Amount,Currency,Status,Description',
    ].join('\n');

    const rows = transactions.map((t) => {
      const type = t.metadata?.transferType ?? 'TRANSFER';
      return `${t.createdAt?.toISOString() ?? ''},${type},${t.amount},${t.currency},${t.status},"${(t.description ?? '').replace(/"/g, '""')}"`;
    });

    return [header, ...rows].join('\n');
  }
}
