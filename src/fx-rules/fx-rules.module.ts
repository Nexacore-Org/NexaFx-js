import { Module, forwardRef } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { FxRatesService } from './fx-rates.service';
import { FxRulesController } from './fx-rules.controller';
import { FxRulesService } from './fx-rules.service';

@Module({
  imports: [WalletsModule, forwardRef(() => TransactionsModule)],
  controllers: [FxRulesController],
  providers: [FxRulesService, FxRatesService],
  exports: [FxRulesService, FxRatesService],
})
export class FxRulesModule {}
