import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Transaction } from '../entities/transaction.entity';
import { TransactionApproval } from '../entities/transaction-approval.entity';
import { TransactionApprovalService } from './transaction-approval.service';
import { TransactionApprovalController } from './transaction-approval.controller';
import { NotificationsModule } from '../modules/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionApproval]),
    ScheduleModule.forRoot(),
    NotificationsModule,
  ],
  controllers: [TransactionApprovalController],
  providers: [TransactionApprovalService],
  exports: [TransactionApprovalService],
})
export class TransactionApprovalModule {}
