import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletBalanceSnapshotEntity } from './entities/wallet-balance-snapshot.entity';
import { WalletEntity } from '../users/entities/wallet.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { WalletHistoryService } from './services/wallet-history.service';
import { WalletHistoryController } from './controllers/wallet-history.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletBalanceSnapshotEntity, WalletEntity, TransactionEntity]),
  ],
  controllers: [WalletHistoryController],
  providers: [WalletHistoryService],
  exports: [WalletHistoryService],
})
export class WalletHistoryModule {}
