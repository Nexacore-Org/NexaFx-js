import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ReconciliationIssueEntity } from './entities/reconciliation-issue.entity';
import { ReconciliationService } from './services/reconciliation.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { ReconciliationAdminController } from './controllers/reconciliation-admin.controller';
import { ReconciliationAnalyticsController } from './controllers/reconciliation-analytics.controller';
import { ReconciliationAnalyticsService } from './services/reconciliation-analytics.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HttpModule,
    BlockchainModule,
    TypeOrmModule.forFeature([ReconciliationIssueEntity, TransactionEntity]),
  ],
  providers: [ReconciliationService, ReconciliationAnalyticsService],
  controllers: [ReconciliationAdminController, ReconciliationAnalyticsController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
