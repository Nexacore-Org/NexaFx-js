import { Module } from '@nestjs/common';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { AdminTransactionsController } from './contorllers/admin-transactions.controller';
import { TransactionReplayService } from './services/transaction-replay.service';
import { TransactionsService } from './services/transactions.service';
import { TransactionsController } from './contorllers/transactions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionExecutionSnapshotEntity } from './entities/transaction-execution-snapshot.entity';

@Module({
  imports: [
    EnrichmentModule,
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionExecutionSnapshotEntity,
    ]),
  ],
  controllers: [AdminTransactionsController, TransactionsController],
  providers: [TransactionReplayService, TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
