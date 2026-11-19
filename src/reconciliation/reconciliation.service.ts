import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { ClusterCron } from '../common/locks/cluster-cron.decorator';
import Big from 'big.js';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';

const TOLERANCE = new Big('0.01');
const RECONCILE_PAGE_SIZE = 500;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepo: Repository<WalletBalanceEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @ClusterCron('0 2 * * *', 'reconciliation:reconcile-all', { ttlMs: 60 * 60 * 1000 })
  async reconcileAll(): Promise<void> {
    // Keyset pagination: never load the whole wallet table into memory (issue #1550).
    let lastId: string | undefined;
    for (;;) {
      const page = await this.walletRepo.find({
        where: lastId ? { id: MoreThan(lastId) } : {},
        order: { id: 'ASC' },
        take: RECONCILE_PAGE_SIZE,
      });
      for (const wallet of page) {
        await this.reconcileAccount(wallet.accountId, wallet.currency);
      }
      if (page.length < RECONCILE_PAGE_SIZE) break;
      lastId = page[page.length - 1].id;
    }
  }

  async reconcileAccount(accountId: string, currency: string): Promise<void> {
    const wallet = await this.walletRepo.findOneBy({ accountId, currency });
    if (!wallet) return;

    const txs = await this.txRepo.find({
      where: [
        { receiverId: accountId, currency, status: TransactionStatus.COMPLETED },
        { senderId: accountId, currency, status: TransactionStatus.COMPLETED },
      ],
    });

    // Archived transactions are deleted from the live table, but the wallet
    // balance still reflects the money they moved — union them back in.
    const archivedTxs = await this.dataSource
      .query(
        `SELECT "senderId", "receiverId", amount, fee, metadata FROM "transactions_archive"
         WHERE ("receiverId" = $1 OR "senderId" = $1) AND currency = $2 AND status = $3`,
        [accountId, currency, TransactionStatus.COMPLETED],
      )
      .catch(() => []);

    let ledgerBalance = new Big('0');
    for (const tx of [...txs, ...archivedTxs]) {
      const amount = new Big(String(tx.amount));
      const fee = new Big(String(tx.fee ?? 0));
      const type = (tx.metadata as { type?: string } | null)?.type;

      if (type === 'auto_sweep' && tx.senderId === accountId) {
        // self-referencing sweep row: the wallet was debited by the swept amount
        ledgerBalance = ledgerBalance.minus(amount);
      } else if (tx.receiverId === accountId && type === 'withdrawal') {
        // self-referencing withdrawal row: money leaves the account
        ledgerBalance = ledgerBalance.minus(amount).minus(fee);
      } else if (tx.receiverId === accountId) {
        // confirmDeposit credits amount - fee; incoming transfers credit amount
        ledgerBalance = type === 'deposit'
          ? ledgerBalance.plus(amount).minus(fee)
          : ledgerBalance.plus(amount);
      } else if (tx.senderId === accountId) {
        // outgoing transfer: sender-side debit, previously never subtracted
        ledgerBalance = ledgerBalance.minus(amount).minus(fee);
      }
    }

    const diff = ledgerBalance.minus(new Big(String(wallet.balance))).abs();

    if (diff.gt(TOLERANCE)) {
      this.logger.warn(
        `Reconciliation alert: account=${accountId} currency=${currency} stored=${wallet.balance} ledger=${ledgerBalance} diff=${diff}`,
      );
    }
  }
}