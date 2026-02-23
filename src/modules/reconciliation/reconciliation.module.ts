import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReconciliationIssueEntity } from './entities/reconciliation-issue.entity';
import { ReconciliationService } from './services/reconciliation.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { ReconciliationAdminController } from './controllers/reconciliation-admin.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([ReconciliationIssueEntity, TransactionEntity]),
  ],
  providers: [ReconciliationService],
  controllers: [ReconciliationAdminController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
