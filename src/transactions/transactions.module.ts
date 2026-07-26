import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsGateway } from './transactions.gateway';
import { TransactionLimitService } from './transaction-limit.service';
import { WalletsModule } from '../wallet/wallets.module';
import { StellarModule } from '../stellar/stellar.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../common/security.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { FxModule } from '../fx/fx.module';
import { FeesModule } from '../fees/fees.module';
import { TermsModule } from '../terms/terms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    WalletsModule,
    StellarModule,
    AuditModule,
    MailModule,
    UsersModule,
    AuthModule,
    SecurityModule,
    IdempotencyModule,
    FxModule,
    FeesModule,
    TermsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionLimitService, TransactionsGateway],
  exports: [TransactionsService],
})
export class TransactionsModule {}
