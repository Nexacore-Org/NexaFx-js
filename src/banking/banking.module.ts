import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BankAccount } from './entities/bank-account.entity';
import { BankAccountController } from './controllers/bank-account.controller';
import { AdminBankingController } from './controllers/admin-banking.controller';
import { BankAccountService } from './services/bank-account.service';
import { BankStatementService } from './services/bank-statement.service';
import { BankReconciliationService } from './services/bank-reconciliation.service';
import { PaymentRailService } from './services/payment-rail.service';
import { UsersModule } from '../../users/users.module';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { NotificationsModule } from '../../notifications/notifications.module';
import { Notification } from '../../notifications/entities/notification.entity';
import { CurrenciesModule } from '../../currencies/currencies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankAccount, Transaction, Notification]),
    ScheduleModule.forRoot(),
    UsersModule,
    NotificationsModule,
    CurrenciesModule,
  ],
  controllers: [BankAccountController, AdminBankingController],
  providers: [BankAccountService, PaymentRailService, BankStatementService, BankReconciliationService],
  exports: [BankAccountService, BankStatementService, BankReconciliationService],
})
export class BankingModule {}
