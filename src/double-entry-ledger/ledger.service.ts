import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import * as crypto from 'crypto';
import { LedgerEntry, EntryType } from './entities/ledger-entry.entity';
import { LedgerAccount } from './entities/ledger-account.entity';
import {
  CreateDoubleEntryDto,
  ReconciliationQueryDto,
  ReconciliationResultDto,
  LedgerBalanceDto,
} from './dto/ledger.dto';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);
  private static readonly EPSILON = 0.000001; // Floating-point tolerance

  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepo: Repository<LedgerEntry>,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountRepo: Repository<LedgerAccount>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Post a balanced double-entry transaction.
   * Throws if debits != credits (per currency).
   */
  async postDoubleEntry(dto: CreateDoubleEntryDto): Promise<LedgerEntry[]> {
    this.validateDoubleEntryBalance(dto);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // Check idempotency — prevent duplicate postings
      const existing = await queryRunner.manager.findOne(LedgerEntry, {
        where: { transactionId: dto.transactionId },
      });
      if (existing) {
        throw new ConflictException(
          `Transaction ${dto.transactionId} has already been posted to the ledger`,
        );
      }

      const entries: LedgerEntry[] = [];

      for (const entryDto of dto.entries) {
        const account = await queryRunner.manager.findOne(LedgerAccount, {
          where: { id: entryDto.accountId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!account) {
          throw new NotFoundException(`Account ${entryDto.accountId} not found`);
        }

        if (account.currency !== entryDto.currency) {
          throw new BadRequestException(
            `Currency mismatch: account ${entryDto.accountId} uses ${account.currency}, entry uses ${entryDto.currency}`,
          );
        }

        const entry = queryRunner.manager.create(LedgerEntry, {
          transactionId: dto.transactionId,
          accountId: entryDto.accountId,
          debit: entryDto.debit,
          credit: entryDto.credit,
          currency: entryDto.currency,
          entryType: entryDto.entryType,
          description: entryDto.description,
          metadata: entryDto.metadata,
          checksum: '', // will be set below
        });

        entry.checksum = this.computeChecksum(entry);
        entries.push(entry);

        // Derive balance update from ledger entry
        const balanceDelta = entryDto.credit - entryDto.debit;
        account.derivedBalance = parseFloat(
          (account.derivedBalance + balanceDelta).toFixed(8),
        );

        await queryRunner.manager.save(LedgerAccount, account);
      }

      const savedEntries = await queryRunner.manager.save(LedgerEntry, entries);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Posted double-entry for transaction ${dto.transactionId} — ${entries.length} entries`,
      );

      return savedEntries;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      if (
        err instanceof ConflictException ||
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      this.logger.error(`Failed to post double-entry: ${err.message}`, err.stack);
      throw new InternalServerErrorException('Failed to post ledger entries');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Reconcile ledger: verify that total debits == total credits
   */
  async reconcile(query: ReconciliationQueryDto): Promise<ReconciliationResultDto> {
    const qb = this.ledgerEntryRepo.createQueryBuilder('le');

    if (query.accountId) qb.andWhere('le.accountId = :accountId', { accountId: query.accountId });
    if (query.currency) qb.andWhere('le.currency = :currency', { currency: query.currency });
    if (query.startDate) qb.andWhere('le.timestamp >= :startDate', { startDate: query.startDate });
    if (query.endDate) qb.andWhere('le.timestamp <= :endDate', { endDate: query.endDate });

    const { totalDebits, totalCredits, count } = await qb
      .select('SUM(le.debit)', 'totalDebits')
      .addSelect('SUM(le.credit)', 'totalCredits')
      .addSelect('COUNT(le.id)', 'count')
      .getRawOne();

    const debits = parseFloat(totalDebits ?? '0');
    const credits = parseFloat(totalCredits ?? '0');
    const discrepancy = Math.abs(debits - credits);
    const isBalanced = discrepancy < LedgerService.EPSILON;

    let discrepantTransactions: string[] = [];

    if (!isBalanced) {
      discrepantTransactions = await this.findDiscrepantTransactions(query);
    }

    return {
      isBalanced,
      totalDebits: debits,
      totalCredits: credits,
      discrepancy,
      entriesChecked: parseInt(count, 10),
      currency: query.currency ?? 'ALL',
      checkedAt: new Date(),
      discrepantTransactions,
    };
  }

  /**
   * Verify integrity of a specific transaction
   */
  async verifyTransactionIntegrity(transactionId: string): Promise<boolean> {
    const entries = await this.ledgerEntryRepo.find({ where: { transactionId } });

    if (entries.length === 0) return true;

    // Verify checksums
    for (const entry of entries) {
      const expected = this.computeChecksum({ ...entry, checksum: '' });
      if (entry.checksum !== expected) {
        this.logger.error(`Checksum mismatch on ledger entry ${entry.id}`);
        return false;
      }
    }

    // Verify balance per currency
    const byCurrency: Record<string, { debit: number; credit: number }> = {};
    for (const e of entries) {
      if (!byCurrency[e.currency]) byCurrency[e.currency] = { debit: 0, credit: 0 };
      byCurrency[e.currency].debit += e.debit;
      byCurrency[e.currency].credit += e.credit;
    }

    for (const [currency, totals] of Object.entries(byCurrency)) {
      if (Math.abs(totals.debit - totals.credit) > LedgerService.EPSILON) {
        this.logger.error(
          `Transaction ${transactionId} is unbalanced for currency ${currency}: debit=${totals.debit}, credit=${totals.credit}`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Get computed balance for an account directly from ledger entries
   */
  async getAccountBalance(accountId: string, currency: string): Promise<LedgerBalanceDto> {
    const { totalDebits, totalCredits, lastEntry } = await this.ledgerEntryRepo
      .createQueryBuilder('le')
      .where('le.accountId = :accountId', { accountId })
      .andWhere('le.currency = :currency', { currency })
      .select('SUM(le.credit) - SUM(le.debit)', 'balance')
      .addSelect('SUM(le.debit)', 'totalDebits')
      .addSelect('SUM(le.credit)', 'totalCredits')
      .addSelect('MAX(le.timestamp)', 'lastEntry')
      .getRawOne();

    const computedBalance = parseFloat(totalCredits ?? '0') - parseFloat(totalDebits ?? '0');

    const account = await this.ledgerAccountRepo.findOne({ where: { id: accountId } });
    const storedBalance = account?.derivedBalance ?? 0;

    return {
      accountId,
      currency,
      computedBalance,
      storedBalance,
      isConsistent: Math.abs(computedBalance - storedBalance) < LedgerService.EPSILON,
      lastEntryAt: lastEntry ? new Date(lastEntry) : null,
    };
  }

  /**
   * Run full integrity validation job across all transactions
   */
  async runIntegrityValidation(): Promise<{ checked: number; failed: string[] }> {
    const transactions = await this.ledgerEntryRepo
      .createQueryBuilder('le')
      .select('DISTINCT le.transactionId', 'transactionId')
      .getRawMany();

    const failed: string[] = [];

    for (const { transactionId } of transactions) {
      const valid = await this.verifyTransactionIntegrity(transactionId);
      if (!valid) failed.push(transactionId);
    }

    this.logger.log(
      `Integrity check complete: ${transactions.length} transactions, ${failed.length} failed`,
    );

    return { checked: transactions.length, failed };
  }

  async getEntriesByTransaction(transactionId: string): Promise<LedgerEntry[]> {
    return this.ledgerEntryRepo.find({
      where: { transactionId },
      order: { timestamp: 'ASC' },
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private validateDoubleEntryBalance(dto: CreateDoubleEntryDto): void {
    const byCurrency: Record<string, { debit: number; credit: number }> = {};

    for (const entry of dto.entries) {
      if (!byCurrency[entry.currency]) byCurrency[entry.currency] = { debit: 0, credit: 0 };
      byCurrency[entry.currency].debit += entry.debit;
      byCurrency[entry.currency].credit += entry.credit;

      if (entry.debit < 0 || entry.credit < 0) {
        throw new BadRequestException('Debit and credit amounts must be non-negative');
      }
      if (entry.debit > 0 && entry.credit > 0) {
        throw new BadRequestException(
          `Entry for account ${entry.accountId} has both debit and credit. Each entry should have only one.`,
        );
      }
      if (entry.debit === 0 && entry.credit === 0) {
        throw new BadRequestException('An entry must have either a debit or credit amount');
      }
    }

    for (const [currency, totals] of Object.entries(byCurrency)) {
      if (Math.abs(totals.debit - totals.credit) > LedgerService.EPSILON) {
        throw new BadRequestException(
          `Unbalanced transaction for currency ${currency}: total debits=${totals.debit}, total credits=${totals.credit}`,
        );
      }
    }
  }

  private computeChecksum(entry: Partial<LedgerEntry>): string {
    const data = `${entry.transactionId}|${entry.accountId}|${entry.debit}|${entry.credit}|${entry.currency}|${entry.entryType}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async findDiscrepantTransactions(query: ReconciliationQueryDto): Promise<string[]> {
    const qb = this.ledgerEntryRepo
      .createQueryBuilder('le')
      .select('le.transactionId', 'transactionId')
      .addSelect('SUM(le.debit)', 'totalDebits')
      .addSelect('SUM(le.credit)', 'totalCredits')
      .groupBy('le.transactionId')
      .having('ABS(SUM(le.debit) - SUM(le.credit)) > :epsilon', {
        epsilon: LedgerService.EPSILON,
      });

    if (query.currency) qb.andWhere('le.currency = :currency', { currency: query.currency });
    if (query.startDate) qb.andWhere('le.timestamp >= :startDate', { startDate: query.startDate });
    if (query.endDate) qb.andWhere('le.timestamp <= :endDate', { endDate: query.endDate });

    const results = await qb.getRawMany();
    return results.map((r) => r.transactionId);
  }
}
