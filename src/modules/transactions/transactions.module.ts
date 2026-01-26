import { Module } from '@nestjs/common';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { AdminTransactionsController } from './contorllers/admin-transactions.controller';
import { TransactionReplayService } from './services/transaction-replay.service';
import { TransactionsService } from './services/transactions.service';
import { WalletAliasService } from './services/wallet-alias.service';
import { TransactionsController } from './contorllers/transactions.controller';
import { WalletAliasController } from './controllers/wallet-alias.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionExecutionSnapshotEntity } from './entities/transaction-execution-snapshot.entity';
import { WalletAliasEntity } from './entities/wallet-alias.entity';

@Module({
  imports: [
    EnrichmentModule,
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionExecutionSnapshotEntity,
      WalletAliasEntity,
    ]),
  ],
  controllers: [AdminTransactionsController, TransactionsController, WalletAliasController],
  providers: [TransactionReplayService, TransactionsService, WalletAliasService],
  exports: [TransactionsService, WalletAliasService],
})
export class TransactionsModule {}
