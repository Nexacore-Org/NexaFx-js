import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../entities/transaction.entity';
import { TransactionApproval } from '../entities/transaction-approval.entity';
import { TransactionApprovalService } from './transaction-approval.service';
import { TransactionApprovalController } from './transaction-approval.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, TransactionApproval])],
  controllers: [TransactionApprovalController],
  providers: [TransactionApprovalService],
  exports: [TransactionApprovalService],
})
export class TransactionApprovalModule {}
