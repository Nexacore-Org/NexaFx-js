import { Module } from '@nestjs/common';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { SessionsModule } from '../sessions/sessions.module';
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
import { TransactionCategoryEntity } from './entities/transaction-category.entity';
import { TransactionRiskEntity } from './entities/transaction-risk.entity';
import { CategoriesController } from './controllers/categories.controller';
import { CategoriesService } from './services/categories.service';
import { TransactionLifecycleService } from './services/transaction-lifecycle.service';
import { TransactionSnapshotService } from './services/transaction-snapshot.service';
import { TransactionSnapshotListener } from './listeners/transaction-snapshot.listener';
import { RiskScoringService } from './services/risk-scoring.service';
import { RiskEvaluationLoggerService } from './services/risk-evaluation-logger.service';
import { RiskScoringAdminController, RiskScoringController } from './controllers/risk-scoring.controller';

@Module({
  imports: [
    EnrichmentModule,
    SessionsModule,
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionExecutionSnapshotEntity,
      WalletAliasEntity,
      TransactionCategoryEntity,
      TransactionRiskEntity,
    ]),
  ],
  controllers: [
    AdminTransactionsController,
    TransactionsController,
    CategoriesController,
    WalletAliasController,
    RiskScoringAdminController,
    RiskScoringController,
  ],
  providers: [
    TransactionReplayService,
    TransactionsService,
    CategoriesService,
    WalletAliasService,
    TransactionLifecycleService,
    TransactionSnapshotService,
    TransactionSnapshotListener,
    RiskScoringService,
    RiskEvaluationLoggerService,
  ],
  exports: [
    TransactionsService,
    CategoriesService,
    WalletAliasService,
    TransactionLifecycleService,
    TransactionSnapshotService,
    RiskScoringService,
    RiskEvaluationLoggerService,
  ],
})
export class TransactionsModule {}
