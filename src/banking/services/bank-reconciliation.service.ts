import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { BankAccount } from '../entities/bank-account.entity';

export interface UnreconciledTransfer {
  transactionId: string;
  bankAccountId: string;
  amount: number;
  currency: string;
  createdAt: Date;
  status: string;
}

@Injectable()
export class BankReconciliationService {
  private readonly logger = new Logger(BankReconciliationService.name);

  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepo: Repository<BankAccount>,
  ) {}

  /**
   * Daily reconciliation cron — runs at 02:00 UTC.
   * Compares bank transfer records vs payment rail webhook events.
   * Idempotent per day per bank account.
   */
  @Cron('0 2 * * *')
  async runDailyReconciliation(): Promise<void> {
    this.logger.log('Starting daily bank reconciliation...');

    const accounts = await this.bankAccountRepo.find();
    let flagged = 0;

    for (const account of accounts) {
      try {
        const unreconciled = await this.findUnreconciledForAccount(account.id);
        if (unreconciled.length > 0) {
          flagged += unreconciled.length;
          this.logger.warn(
            `Account ${account.id}: ${unreconciled.length} unreconciled transfers`,
          );
        }
      } catch (err: any) {
        this.logger.error(`Reconciliation failed for account ${account.id}: ${err.message}`);
      }
    }

    this.logger.log(`Daily reconciliation complete. Flagged: ${flagged}`);
  }

  /**
   * GET /admin/banking/unreconciled
   * Returns bank transfers without matching settlement webhooks.
   */
  async getUnreconciled(): Promise<UnreconciledTransfer[]> {
    // Transfers are "unreconciled" if status is PENDING and older than 24h
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await this.bankAccountRepo.manager
      .getRepository('transactions')
      .createQueryBuilder('t')
      .where(`t.metadata->>'bankAccountId' IS NOT NULL`)
      .andWhere(`t.status = 'PENDING'`)
      .andWhere(`t.createdAt < :cutoff`, { cutoff })
      .orderBy('t.createdAt', 'ASC')
      .getMany();

    return rows.map((t: any) => ({
      transactionId: t.id,
      bankAccountId: t.metadata?.bankAccountId,
      amount: Number(t.amount),
      currency: t.currency,
      createdAt: t.createdAt,
      status: t.status,
    }));
  }

  /**
   * POST /admin/banking/force-settle/:id
   * Manually marks a transfer as settled.
   */
  async forceSettle(transactionId: string, adminUserId: string): Promise<void> {
    const tx = await this.bankAccountRepo.manager
      .getRepository('transactions')
      .findOne({ where: { id: transactionId } });

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);

    await this.bankAccountRepo.manager
      .getRepository('transactions')
      .update(transactionId, {
        status: 'SUCCESS',
        metadata: { ...(tx as any).metadata, forcedSettledBy: adminUserId, forcedSettledAt: new Date() },
      });

    this.logger.log(`Transaction ${transactionId} force-settled by admin ${adminUserId}`);
  }

  private async findUnreconciledForAccount(bankAccountId: string): Promise<any[]> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.bankAccountRepo.manager
      .getRepository('transactions')
      .createQueryBuilder('t')
      .where(`t.metadata->>'bankAccountId' = :bankAccountId`, { bankAccountId })
      .andWhere(`t.status = 'PENDING'`)
      .andWhere(`t.createdAt < :cutoff`, { cutoff })
      .getMany();
  }
}
