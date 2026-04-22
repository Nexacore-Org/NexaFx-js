import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BankAccount } from './entities/bank-account.entity';
import { PaymentLink } from './entities/payment-link.entity';
import { BankAccountController } from './controllers/bank-account.controller';
import { AdminBankingController } from './controllers/admin-banking.controller';
import { BankAccountService } from './services/bank-account.service';
import { BankStatementService } from './services/bank-statement.service';
import { BankReconciliationService } from './services/bank-reconciliation.service';
import { PaymentLinkController } from './payment-link.controller';
import { BankAccountService } from './services/bank-account.service';
import { PaymentLinkService } from './services/payment-link.service';
import { PaymentRailService } from './services/payment-rail.service';

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
  imports: [TypeOrmModule.forFeature([BankAccount, PaymentLink])],
  controllers: [BankAccountController, PaymentLinkController],
  providers: [BankAccountService, PaymentLinkService, PaymentRailService],
  exports: [BankAccountService, PaymentLinkService],
})
export class BankingModule {}
