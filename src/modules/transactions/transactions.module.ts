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
  ],
})
export class TransactionsModule {}
