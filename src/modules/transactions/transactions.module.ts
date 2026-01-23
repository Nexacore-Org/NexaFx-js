import { EnrichmentModule } from '../enrichment/enrichment.module';
import { AdminTransactionsController } from './controllers/admin-transactions.controller';
import { TransactionReplayService } from './services/transaction-replay.service';

@Module({
  controllers: [
    // ...existing controllers
    AdminTransactionsController,
  ],
  providers: [
    // ...existing providers
    TransactionReplayService,
      EnrichmentModule,
  ],
})
export class TransactionsModule {}
