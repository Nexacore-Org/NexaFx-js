import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import Big from 'big.js';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';
import { AuditService } from '../audit/audit.service';
import { LedgerVerificationResult } from './ledger-verification-result.entity';

const TOLERANCE = new Big('0.01');

@Injectable()
export class LedgerVerificationService {
  private readonly logger = new Logger(LedgerVerificationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepo: Repository<WalletBalanceEntity>,
    @InjectRepository(LedgerVerificationResult)
    private readonly resultRepo: Repository<LedgerVerificationResult>,
    private readonly auditService: AuditService,
  ) {}

  @Cron('0 4 * * *')
  async verify(): Promise<LedgerVerificationResult> {
    this.logger.log('Starting nightly ledger verification');
    const wallets = await this.walletRepo.find();
    const discrepancies: Record<string, unknown>[] = [];

    for (const wallet of wallets) {
      const raw = await this.txRepo
        .createQueryBuilder('tx')
        .select('COALESCE(SUM(tx.amount::numeric), 0)', 'total')
        .where(
          'tx.receiverId = :id AND tx.currency = :currency AND tx.status = :status',
          { id: wallet.accountId, currency: wallet.currency, status: TransactionStatus.COMPLETED },
        )
        .getRawOne<{ total: string }>();

      const ledgerBalance = new Big(raw?.total ?? '0');
      const storedBalance = new Big(String(wallet.balance));
      const diff = ledgerBalance.minus(storedBalance).abs();

      if (diff.gt(TOLERANCE)) {
        const discrepancy = {
          accountId: wallet.accountId,
          currency: wallet.currency,
          stored: storedBalance.toFixed(8),
          ledger: ledgerBalance.toFixed(8),
          diff: diff.toFixed(8),
        };
        discrepancies.push(discrepancy);

        this.logger.warn(
          `Ledger discrepancy: account=${wallet.accountId} currency=${wallet.currency} stored=${storedBalance} ledger=${ledgerBalance} diff=${diff}`,
        );

        await this.auditService.log({
          action: 'ledger.discrepancy',
          entityType: 'wallet_balance',
          entityId: wallet.id,
          after: discrepancy,
        });
      }
    }

    const result = this.resultRepo.create({
      totalChecked: wallets.length,
      discrepancyCount: discrepancies.length,
      discrepancies: discrepancies.length > 0 ? discrepancies : null,
    });
    const saved = await this.resultRepo.save(result);

    this.logger.log(
      `Ledger verification complete: checked=${wallets.length} discrepancies=${discrepancies.length}`,
    );
    return saved;
  }
}
