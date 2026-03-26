import { Module, forwardRef } from '@nestjs/common';
import { FxRulesModule } from '../fx-rules/fx-rules.module';
import { WalletsModule } from '../wallets/wallets.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [WalletsModule, forwardRef(() => FxRulesModule)],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
