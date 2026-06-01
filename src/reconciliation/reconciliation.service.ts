import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';

const TOLERANCE = 0.01;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepo: Repository<WalletBalanceEntity>,
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

    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('SUM(tx.amount)', 'total')
      .where('tx.receiverId = :id AND tx.currency = :currency AND tx.status = :status', {
        id: accountId, currency, status: TransactionStatus.COMPLETED,
      })
      .getRawOne<{ total: string }>();

    const ledgerBalance = parseFloat(result?.total ?? '0');
    const diff = Math.abs(ledgerBalance - Number(wallet.balance));

    if (diff > TOLERANCE) {
      this.logger.warn(
        `Reconciliation alert: account=${accountId} currency=${currency} stored=${wallet.balance} ledger=${ledgerBalance} diff=${diff}`,
      );
    }
  }
}