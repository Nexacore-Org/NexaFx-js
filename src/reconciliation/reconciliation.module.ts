import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';
import { AuditModule } from '../audit/audit.module';
import { ReconciliationService } from './reconciliation.service';
import { LedgerVerificationService } from './ledger-verification.service';
import { LedgerVerificationResult } from './ledger-verification-result.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, WalletBalanceEntity, LedgerVerificationResult]),
    AuditModule,
  ],
  providers: [ReconciliationService, LedgerVerificationService],
  exports: [LedgerVerificationService],
})
export class ReconciliationModule {}
