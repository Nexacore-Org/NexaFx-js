import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { WalletsModule } from '../wallet/wallets.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), WalletsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
