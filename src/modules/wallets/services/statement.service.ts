import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { createHash } from 'crypto';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';

export interface StatementResult {
  walletId: string;
  currency: string;
  from: Date;
  to: Date;
  openingBalance: number;
  closingBalance: number;
  transactions: TransactionEntity[];
  checksum: string;
}

@Injectable()
export class StatementService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
  ) {}

  async generateStatement(walletId: string, from: Date, to: Date): Promise<StatementResult> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    // Transactions before the range to compute opening balance
    const priorTxs = await this.txRepo.find({
      where: { walletId, status: 'SUCCESS' },
      order: { createdAt: 'ASC' },
    });

    const inRangeTxs = await this.txRepo.find({
      where: { walletId, createdAt: Between(from, to) },
      order: { createdAt: 'ASC' },
    });

    const openingBalance = this.computeBalance(
      priorTxs.filter((t) => t.createdAt < from),
    );
    const closingBalance = this.computeBalance(
      priorTxs.filter((t) => t.createdAt <= to),
    );

    const payload = JSON.stringify({ walletId, from, to, openingBalance, closingBalance, count: inRangeTxs.length });
    const checksum = createHash('sha256').update(payload).digest('hex');

    return {
      walletId,
      currency: wallet.type,
      from,
      to,
      openingBalance,
      closingBalance,
      transactions: inRangeTxs,
      checksum,
    };
  }

  private computeBalance(txs: TransactionEntity[]): number {
    return txs.reduce((sum, tx) => {
      const amount = Number(tx.amount);
      const isCredit = tx.metadata?.type === 'CREDIT' || tx.fromAddress == null;
      return sum + (isCredit ? amount : -amount);
    }, 0);
  }
}
