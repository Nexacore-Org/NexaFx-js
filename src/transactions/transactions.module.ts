import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransactionLimitService } from './transaction-limit.service';
import { WalletsModule } from '../wallet/wallets.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../common/security.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { FxModule } from '../fx/fx.module';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    WalletsModule,
    AuditModule,
    MailModule,
    UsersModule,
    AuthModule,
    SecurityModule,
    IdempotencyModule,
    FxModule,
    FeesModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionLimitService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
