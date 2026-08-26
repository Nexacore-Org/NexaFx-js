import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import Big from 'big.js';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';

const TOLERANCE = new Big('0.01');

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

  @Cron('0 2 * * *')
  async reconcileAll(): Promise<void> {
    const wallets = await this.walletRepo.find();
    for (const wallet of wallets) {
      await this.reconcileAccount(wallet.accountId, wallet.currency);
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

      if (tx.receiverId === accountId && type === 'withdrawal') {
        // self-referencing withdrawal row: money leaves the account
        ledgerBalance = ledgerBalance.minus(amount).minus(fee);
      } else if (tx.receiverId === accountId) {
        // deposit or incoming transfer: money enters the account
        ledgerBalance = ledgerBalance.plus(amount);
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