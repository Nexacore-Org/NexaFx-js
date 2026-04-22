import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Transaction } from '../entities/transaction.entity';
import { TransactionApproval } from '../entities/transaction-approval.entity';
import { ApprovalPolicy } from './entities/approval-policy.entity';
import { TransactionApprovalService } from './transaction-approval.service';
import { TransactionApprovalController } from './transaction-approval.controller';
import { ApprovalPolicyService } from './services/approval-policy.service';
import { ApprovalPolicyController } from './controllers/approval-policy.controller';
import { NotificationsModule } from '../modules/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionApproval, ApprovalPolicy]),
    ScheduleModule.forRoot(),
    NotificationsModule,
  ],
  controllers: [TransactionApprovalController, ApprovalPolicyController],
  providers: [TransactionApprovalService, ApprovalPolicyService],
  exports: [TransactionApprovalService, ApprovalPolicyService],
})
export class TransactionApprovalModule {}
