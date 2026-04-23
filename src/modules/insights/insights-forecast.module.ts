import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { Goal } from '../../goals/entities/goal.entity';
import { WalletEntity } from '../users/entities/wallet.entity';

import { SpendingInsightsService } from './services/spending-insights.service';
import { ForecastService } from './services/forecast.service';
import { CashflowService } from './services/cashflow.service';
import { InsightsController } from './controllers/insights.controller';
import { ForecastController } from './controllers/forecast.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, Goal, WalletEntity]),
    NotificationsModule,
  ],
  controllers: [InsightsController, ForecastController],
  providers: [SpendingInsightsService, ForecastService, CashflowService],
  exports: [SpendingInsightsService, ForecastService, CashflowService],
})
export class InsightsForecastModule {}
