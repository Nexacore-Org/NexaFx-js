import { Module } from '@nestjs/common';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { SessionsModule } from '../sessions/sessions.module';
import { FxModule } from '../fx/fx.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { AdminTransactionsController } from './contorllers/admin-transactions.controller';
import { TransactionReplayService } from './services/transaction-replay.service';
import { TransactionsService } from './services/transactions.service';
import { WalletAliasService } from './services/wallet-alias.service';
import { ReceiptService } from './services/receipt.service';
import { TransactionsController } from './contorllers/transactions.controller';
import { WalletAliasController } from './controllers/wallet-alias.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionExecutionSnapshotEntity } from './entities/transaction-execution-snapshot.entity';
import { WalletAliasEntity } from './entities/wallet-alias.entity';
import { TransactionCategoryEntity } from './entities/transaction-category.entity';
import { TransactionRiskEntity } from './entities/transaction-risk.entity';
import { TransactionNoteEntity } from './entities/transaction-note.entity';
import { TransactionTagEntity } from './entities/transaction-tag.entity';
import { BulkBatch } from './entities/bulk-batch.entity';
import { CategoriesController } from './controllers/categories.controller';
import { CategoriesService } from './services/categories.service';
import { CategorizationService } from './services/categorization.service';
import { TransactionLifecycleService } from './services/transaction-lifecycle.service';
import { TransactionSnapshotService } from './services/transaction-snapshot.service';
import { TransactionSnapshotListener } from './listeners/transaction-snapshot.listener';
import { RiskScoringService } from './services/risk-scoring.service';
import { RiskEvaluationLoggerService } from './services/risk-evaluation-logger.service';
import { RiskScoringAdminController, RiskScoringController } from './controllers/risk-scoring.controller';
import { TransactionAnnotationService } from './services/transaction-annotation.service';
import { BulkTransactionService } from './services/bulk-transaction.service';
import { BulkTransactionsController } from './controllers/bulk-transactions.controller';
import { AdminBulkTransactionsController } from './controllers/admin-bulk-transactions.controller';
import { RiskPreTradeGuard } from '../risk-engine/services/risk-pre-trade.guard';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { TransactionRiskIndicatorListener } from './listeners/transaction-risk-indicator.listener';
import { TransactionWebsocketListener } from './listeners/transaction-websocket.listener';
import { NotificationsModule } from '../../web-sockets/notifications.module';

@Module({
  imports: [
    EnrichmentModule,
    SessionsModule,
    FxModule,
    WebhooksModule,
    IdempotencyModule,
    EventEmitterModule.forRoot(),
    RiskEngineModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionExecutionSnapshotEntity,
      WalletAliasEntity,
      TransactionCategoryEntity,
      TransactionRiskEntity,
      TransactionNoteEntity,
      TransactionTagEntity,
      BulkBatch,
    ]),
  ],
  controllers: [
    AdminTransactionsController,
    TransactionsController,
    CategoriesController,
    WalletAliasController,
    RiskScoringAdminController,
    RiskScoringController,
    BulkTransactionsController,
    AdminBulkTransactionsController,
  ],
  providers: [
    TransactionReplayService,
    TransactionsService,
    CategoriesService,
    CategorizationService,
    WalletAliasService,
    TransactionLifecycleService,
    TransactionSnapshotService,
    TransactionSnapshotListener,
    TransactionRiskIndicatorListener,
    TransactionWebsocketListener,
    RiskScoringService,
    RiskEvaluationLoggerService,
    ReceiptService,
    TransactionAnnotationService,
    BulkTransactionService,
    RiskPreTradeGuard,
  ],
  exports: [
    TransactionsService,
    CategoriesService,
    CategorizationService,
    WalletAliasService,
    TransactionLifecycleService,
    TransactionSnapshotService,
    RiskScoringService,
    RiskEvaluationLoggerService,
    ReceiptService,
    BulkTransactionService,
  ],
})
export class TransactionsModule {}
