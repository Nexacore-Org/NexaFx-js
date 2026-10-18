import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletBalanceSnapshotEntity } from './entities/wallet-balance-snapshot.entity';
import { WalletBalanceEntity } from '../../wallet/wallet-balance.entity';
import { FxModule } from '../../fx/fx.module';
import { WalletHistoryService } from './services/wallet-history.service';
import { WalletHistoryController } from './controllers/wallet-history.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletBalanceSnapshotEntity, WalletBalanceEntity]),
    FxModule,
  ],
  controllers: [WalletHistoryController],
  providers: [WalletHistoryService],
  exports: [WalletHistoryService],
})
export class WalletHistoryModule {}
