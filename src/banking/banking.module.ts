import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { PaymentLink } from './entities/payment-link.entity';
import { BankAccountController } from './controllers/bank-account.controller';
import { PaymentLinkController } from './payment-link.controller';
import { BankAccountService } from './services/bank-account.service';
import { PaymentLinkService } from './services/payment-link.service';
import { PaymentRailService } from './services/payment-rail.service';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, PaymentLink])],
  controllers: [BankAccountController, PaymentLinkController],
  providers: [BankAccountService, PaymentLinkService, PaymentRailService],
  exports: [BankAccountService, PaymentLinkService],
})
export class BankingModule {}
