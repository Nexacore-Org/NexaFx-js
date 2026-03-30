import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledTransactionEntity } from './entities/scheduled-transaction.entity';
import { ScheduledTransactionService } from './services/scheduled-transaction.service';
import { SchedulerService } from './services/scheduler.service';
import {
  ScheduledTransactionController,
  AdminScheduledTransactionController,
} from './controllers/scheduled-transaction.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledTransactionEntity]),
    ScheduleModule.forRoot(),
    TransactionsModule,
    NotificationsModule,
  ],
  controllers: [ScheduledTransactionController, AdminScheduledTransactionController],
  providers: [ScheduledTransactionService, SchedulerService],
  exports: [ScheduledTransactionService],
})
export class ScheduledTransactionsModule {}
